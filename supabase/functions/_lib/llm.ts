// One client for every AI call. Keys are server-side only and never reach the browser.
//
// The platform calls LLM_BASE_URL with LLM_API_KEY / OPENAI_API_KEY and LLM_MODEL (default OpenAI,
// gpt-6-luna). A student on the Independent plan brings their own OpenAI-compatible API instead: their
// key, base URL and model (`OwnProvider`), and every call for them goes there.
//
// Models and providers differ in which settings they accept (GPT-5+ rejects temperature and counts hidden
// reasoning against the token limit; some hosts know max_tokens but not max_completion_tokens, or have no
// strict JSON mode). `profile()` translates one set of intentions per model family, and for providers
// other than OpenAI `send()` steps down to simpler requests when one is refused. Prompts and answer checks
// stay the same; the tutor test suite (scripts/tutor-eval) is the gate before switching platform models.
//
// When the platform model is not OpenAI's (for example Inception's Mercury), two things stay on OpenAI with
// OPENAI_API_KEY: reading images (Mercury is text-only), and a fallback if the platform provider fails or its
// credit runs out, so a student gets an answer either way. A student's own key never falls back.
import { normalizeBase } from "./url.ts";
export { safeBaseUrl } from "./url.ts";

export const LLM_BASE_URL = normalizeBase(Deno.env.get("LLM_BASE_URL") ?? "https://api.openai.com/v1");
export const LLM_MODEL = Deno.env.get("LLM_MODEL") ?? "gpt-6-luna";
/** For quick decisions (routing a message, naming a file). Defaults to the main model. */
export const LLM_FAST_MODEL = Deno.env.get("LLM_FAST_MODEL") ?? LLM_MODEL;
const PLATFORM_KEY = Deno.env.get("LLM_API_KEY") ?? Deno.env.get("OPENAI_API_KEY");
const OPENAI_BASE = "https://api.openai.com/v1";
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
/** OpenAI model for images and for the fallback, when the platform model is another provider's. */
const OPENAI_MODEL = Deno.env.get("LLM_FALLBACK_MODEL") ?? "gpt-6-luna";

/** A student's own OpenAI-compatible API (Independent plan). */
export type OwnProvider = { apiKey: string; baseUrl: string; model: string };

/** Who and what a call was for, so its token usage can be recorded (table ai_usage). */
export type UsageMeta = { feature: string; userId?: string | null; byok?: boolean };
type UsageRow = { user_id: string | null; feature: string; model: string; input_tokens: number; cached_tokens: number; output_tokens: number; reasoning_tokens: number; byok: boolean; flex: boolean };
let usageLogger: ((row: UsageRow) => PromiseLike<unknown>) | null = null;

/** Each function plugs in how to save usage rows (with its service-role client). */
export function setUsageLogger(fn: (row: UsageRow) => PromiseLike<unknown>) {
  usageLogger = fn;
}

/** Save one call's token counts. Never throws: usage tracking must not break a student's answer. */
// deno-lint-ignore no-explicit-any
export async function recordUsage(meta: UsageMeta | undefined, model: string, usage: any, flex = false) {
  if (!meta || !usage || !usageLogger) return;
  try {
    await usageLogger({
      user_id: meta.userId ?? null,
      feature: meta.feature,
      model: model.slice(0, 80),
      input_tokens: usage.prompt_tokens ?? usage.input_tokens ?? 0,
      cached_tokens: usage.prompt_tokens_details?.cached_tokens ?? usage.input_tokens_details?.cached_tokens ?? 0,
      output_tokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
      reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens ?? usage.output_tokens_details?.reasoning_tokens ?? 0,
      byok: !!meta.byok,
      flex,
    });
  } catch (e) {
    console.error("usage log", e instanceof Error ? e.message : e);
  }
}

/** How hard the model should think: light (routing, titles, small talk), normal, or deep (worked math, quizzes). */
export type Effort = "light" | "normal" | "deep";
type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };
type Message = { role: "system" | "user" | "assistant"; content: string | Part[] };
type Body = Record<string, unknown>;

export class LLMError extends Error {
  /** Seconds the provider asked us to wait (rate limits), when it said. */
  retryAfter?: number;
  /** "quota" when the account is out of credit: retrying will not help. */
  kind: "rate_limit" | "quota" | "auth" | "other";
  constructor(public status: number, message: string, retryAfter?: number) {
    super(message);
    this.name = "LLMError";
    this.retryAfter = retryAfter;
    this.kind = status === 401 || status === 403 ? "auth" : status === 429 && /insufficient_quota|billing|exceeded your current quota|credit/i.test(message) ? "quota" : status === 429 ? "rate_limit" : "other";
  }
}

// ---------------------------------------------------------------------------
// Where a call goes
// ---------------------------------------------------------------------------

const isOpenAI = (baseUrl: string) => /^https:\/\/api\.openai\.com(\/|$)/.test(baseUrl);

type Target = { baseUrl: string; apiKey: string; model: string };

function target(own: OwnProvider | undefined, model: string | undefined): Target {
  if (own) return { baseUrl: normalizeBase(own.baseUrl), apiKey: own.apiKey, model: own.model };
  if (!PLATFORM_KEY) throw new LLMError(500, "OPENAI_API_KEY (or LLM_API_KEY) is not set");
  return { baseUrl: LLM_BASE_URL, apiKey: PLATFORM_KEY, model: model ?? LLM_MODEL };
}

/** OpenAI, to try when a platform call to another provider fails. Null for a student's own key, or when already on OpenAI. */
function fallbackFor(t: Target, own: OwnProvider | undefined): Target | null {
  if (own || isOpenAI(t.baseUrl) || !OPENAI_KEY) return null;
  return { baseUrl: OPENAI_BASE, apiKey: OPENAI_KEY, model: OPENAI_MODEL };
}

/** Run a platform call, and if its provider fails, run it once more on OpenAI. */
async function withFallback<T>(t: Target, own: OwnProvider | undefined, call: (t: Target) => Promise<T>, skip = false): Promise<T> {
  try {
    return await call(t);
  } catch (e) {
    const fb = skip ? null : fallbackFor(t, own);
    if (!fb) throw e;
    console.warn("llm fallback to OpenAI", t.model, e instanceof Error ? e.message.slice(0, 200) : e);
    return call(fb);
  }
}

// ---------------------------------------------------------------------------
// Request settings
// ---------------------------------------------------------------------------

/** Translate intentions into request settings for the model family and provider. */
export function profile(model: string, effort: Effort, maxTokens: number, baseUrl = LLM_BASE_URL): Body {
  const tokenParam = isOpenAI(baseUrl) ? "max_completion_tokens" : "max_tokens";
  // GPT-5 and later OpenAI reasoning models (also when reached through another host, e.g. "openai/gpt-5.6-luna").
  if (/^(openai\/)?gpt-([5-9]|\d{2})/i.test(model)) {
    // GPT-5 (original) has "minimal"; GPT-5.1 and later have "none" instead.
    const lightest = /^(openai\/)?gpt-5(-|$)/i.test(model) ? "minimal" : "none";
    const reasoning_effort = { light: lightest, normal: "low", deep: "medium" }[effort];
    // Hidden reasoning counts against the token limit, so leave room for it.
    const headroom = { light: 1000, normal: 4000, deep: 8000 }[effort];
    return { reasoning_effort, [tokenParam]: maxTokens + headroom };
  }
  // Inception's Mercury (diffusion models): reasoning effort low, medium or high. Its hidden reasoning also
  // counts against the token limit, so leave room for it as for GPT.
  if (/mercury/i.test(model)) {
    const headroom = { light: 1000, normal: 4000, deep: 8000 }[effort];
    return { reasoning_effort: { light: "low", normal: "medium", deep: "high" }[effort], [tokenParam]: maxTokens + headroom };
  }
  const out: Body = { temperature: 0.3, [tokenParam]: maxTokens + 2000 };
  if (/gpt-oss/i.test(model)) out.reasoning_effort = effort === "deep" ? "medium" : "low";
  if (/groq\.com/.test(baseUrl)) out.include_reasoning = false;
  return out;
}

/**
 * Simpler versions of a request, tried in order when a provider other than OpenAI rejects one with a
 * 400: first drop optional settings, then ask for plain JSON instead of a strict schema, then no format.
 */
const STEP_DOWN: ((b: Body) => Body)[] = [
  (b) => {
    const { reasoning_effort: _r, stream_options: _s, service_tier: _t, include_reasoning: _i, max_completion_tokens, ...rest } = b;
    return max_completion_tokens ? { ...rest, max_tokens: max_completion_tokens } : rest;
  },
  (b) => {
    // deno-lint-ignore no-explicit-any
    const rf = b.response_format as any;
    if (rf?.type !== "json_schema") return b;
    const hint = `Reply with only a JSON object (no code fences) that matches this JSON Schema:\n${JSON.stringify(rf.json_schema.schema)}`;
    const messages = [...(b.messages as Message[])];
    messages[0] = messages[0]?.role === "system" ? { ...messages[0], content: `${messages[0].content}\n\n${hint}` } : messages[0];
    if (messages[0]?.role !== "system") messages.unshift({ role: "system", content: hint });
    return { ...b, messages, response_format: { type: "json_object" } };
  },
  (b) => {
    const { response_format: _f, temperature: _t, ...rest } = b;
    return rest;
  },
];

function retryAfterOf(res: Response) {
  const ms = Number(res.headers.get("retry-after-ms"));
  if (Number.isFinite(ms) && ms > 0) return ms / 1000;
  const s = Number(res.headers.get("retry-after"));
  return Number.isFinite(s) && s > 0 ? s : undefined;
}

async function send(t: Target, body: Body, timeoutMs: number): Promise<Response> {
  let b = body;
  for (let step = 0; ; step++) {
    const res = await fetch(`${t.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(b),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status !== 400 || isOpenAI(t.baseUrl) || step >= STEP_DOWN.length) return res;
    const text = await res.clone().text().catch(() => "");
    if (/json_validate_failed|context.{0,20}length|too long|maximum context/i.test(text)) return res;
    b = STEP_DOWN[step](b);
  }
}

/** Parse JSON from a model that may wrap it in code fences or a sentence. */
function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s >= 0 && e > s) return JSON.parse(text.slice(s, e + 1)) as T;
    throw new Error("model did not return JSON");
  }
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

/** Ask for JSON matching `schema` (strict mode: every property required, no extra properties). */
export async function llmJson<T>(opts: {
  messages: Message[];
  schemaName: string;
  schema: Record<string, unknown>;
  effort?: Effort;
  maxTokens?: number;
  /** The student's own API (Independent plan); otherwise the platform's. */
  own?: OwnProvider;
  timeoutMs?: number;
  /** Platform model to use (ignored with `own`, which brings its own model). */
  model?: string;
  /** Fail at once instead of retrying (for calls that have a fallback). */
  noRetry?: boolean;
  /**
   * Try OpenAI's half-price Flex processing (slower, sometimes unavailable). For background work only.
   * Errors are thrown as usual, so the caller's retry runs at standard price.
   */
  flex?: boolean;
  usage?: UsageMeta;
}): Promise<T> {
  return withFallback(target(opts.own, opts.model), opts.own, (t) => jsonOnce<T>(t, opts), opts.noRetry);
}

async function jsonOnce<T>(t: Target, opts: Parameters<typeof llmJson>[0]): Promise<T> {
  const flex = !!opts.flex && !opts.own && isOpenAI(t.baseUrl);
  const body = {
    model: t.model,
    ...(flex ? { service_tier: "flex" } : {}),
    messages: opts.messages,
    response_format: { type: "json_schema", json_schema: { name: opts.schemaName, strict: true, schema: opts.schema } },
    ...profile(t.model, opts.effort ?? "normal", opts.maxTokens ?? 2048, t.baseUrl),
  };
  for (let attempt = 0; ; attempt++) {
    const res = await send(t, body, opts.timeoutMs ?? 60_000);
    if (res.ok) {
      const data = await res.json();
      await recordUsage(opts.usage, t.model, data?.usage, flex);
      const choice = data?.choices?.[0];
      const text = choice?.message?.content;
      if (typeof text !== "string" || !text) {
        // A reasoning model can spend the whole budget thinking; that is worth one retry.
        if (attempt < 1 && !opts.noRetry) continue;
        throw new LLMError(502, `no content (finish_reason ${choice?.finish_reason ?? "?"})`);
      }
      return parseJson<T>(text);
    }
    const text = (await res.text()).slice(0, 500);
    const err = new LLMError(res.status, text, retryAfterOf(res));
    // Retry brief rate limits and server errors once, and an occasional invalid structured output twice.
    // Flex errors go straight back: the caller's retry uses standard processing.
    const retriable = (err.kind === "rate_limit" || res.status >= 500 || (res.status === 400 && /json_validate_failed|invalid json/i.test(text))) && !opts.noRetry && !flex;
    const wait = res.status === 400 ? 0.2 : err.retryAfter ?? 1;
    if (retriable && wait <= 5 && attempt < (res.status === 400 ? 2 : 1)) {
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    throw err;
  }
}

/**
 * Read one image of a page (a scan or a photo of notes) and return its text. Uses the platform's
 * OCR model (OCR_MODEL, default the main model), which must accept images.
 */
export async function llmReadImage(opts: { dataUrl: string; prompt: string; usage?: UsageMeta; timeoutMs?: number }): Promise<string> {
  // A platform model from another provider may not read images (Mercury is text-only): use OpenAI for these.
  const t = isOpenAI(LLM_BASE_URL) || !OPENAI_KEY
    ? target(undefined, Deno.env.get("OCR_MODEL") ?? LLM_MODEL)
    : { baseUrl: OPENAI_BASE, apiKey: OPENAI_KEY, model: Deno.env.get("OCR_MODEL") ?? OPENAI_MODEL };
  const body = {
    model: t.model,
    messages: [{ role: "user", content: [{ type: "text", text: opts.prompt }, { type: "image_url", image_url: { url: opts.dataUrl, detail: "high" } }] }],
    ...profile(t.model, "light", 3000, t.baseUrl),
  };
  for (let attempt = 0; ; attempt++) {
    const res = await send(t, body, opts.timeoutMs ?? 90_000);
    if (res.ok) {
      const data = await res.json();
      await recordUsage(opts.usage, t.model, data?.usage);
      const text = data?.choices?.[0]?.message?.content;
      return typeof text === "string" ? text : "";
    }
    const text = (await res.text()).slice(0, 500);
    const err = new LLMError(res.status, text, retryAfterOf(res));
    const wait = err.retryAfter ?? 2;
    if ((err.kind === "rate_limit" || res.status >= 500) && attempt < 2 && wait <= 10) {
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    throw err;
  }
}

/** Start a streamed answer. The caller reads OpenAI-style SSE chunks from `res.body`. Returns the model used too. */
export async function llmStream(opts: { messages: Message[]; effort?: Effort; maxTokens?: number; own?: OwnProvider; timeoutMs?: number; model?: string }) {
  return withFallback(target(opts.own, opts.model), opts.own, async (t) => {
    // include_usage adds a last chunk with the token counts, for recordUsage().
    const res = await send(t, { model: t.model, messages: opts.messages, stream: true, stream_options: { include_usage: true }, ...profile(t.model, opts.effort ?? "normal", opts.maxTokens ?? 1500, t.baseUrl) }, opts.timeoutMs ?? 90_000);
    if (!res.ok || !res.body) {
      const text = (await res.text().catch(() => "")).slice(0, 500);
      throw new LLMError(res.status, text, retryAfterOf(res));
    }
    return { res, model: t.model };
  });
}

/** Models a provider lists that look most like what the student typed (same maker first, then shared name parts). */
export function closestModels(typed: string, ids: string[], n = 6) {
  const t = typed.toLowerCase();
  const maker = t.includes("/") ? t.split("/")[0] : "";
  const parts = t.split(/[\/:_.\s-]+/).filter((p) => p.length > 1);
  const scored = ids.map((id) => {
    const l = id.toLowerCase();
    const score = (maker && l.startsWith(`${maker}/`) ? 3 : 0) + parts.filter((p) => l.includes(p)).length;
    return { id, score };
  });
  const best = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.id.length - b.id.length);
  return (best.length ? best : scored).slice(0, n).map((x) => x.id);
}

/**
 * Check a student's own API before saving it: the key must be accepted, the model must exist (when the
 * provider lists its models), and one tiny test answer must work.
 */
export async function checkProvider(own: OwnProvider): Promise<{ result: "ok" | "invalid" | "unreachable" | "model_not_found" | "not_compatible"; suggestions?: string[] }> {
  const base = normalizeBase(own.baseUrl);
  const headers = { Authorization: `Bearer ${own.apiKey}` };
  try {
    const list = await fetch(`${base}/models`, { headers, signal: AbortSignal.timeout(10_000) });
    if (list.status === 401 || list.status === 403) return { result: "invalid" };
    if (list.ok) {
      const data = await list.json().catch(() => null);
      const ids: string[] = Array.isArray(data?.data) ? data.data.map((m: { id?: string }) => String(m?.id ?? "")).filter(Boolean) : [];
      if (ids.length && !ids.includes(own.model)) {
        return { result: "model_not_found", suggestions: closestModels(own.model, ids) };
      }
    }
  } catch {
    // Some providers have no model list; the test answer below decides.
  }
  try {
    const t = { baseUrl: base, apiKey: own.apiKey, model: own.model };
    const res = await send(t, { model: own.model, messages: [{ role: "user", content: "Reply with the single word OK." }], ...profile(own.model, "light", 16, base) }, 30_000);
    if (res.ok) {
      const data = await res.json().catch(() => null);
      return typeof data?.choices?.[0]?.message?.content === "string" ? { result: "ok" } : { result: "not_compatible" };
    }
    if (res.status === 401 || res.status === 403) return { result: "invalid" };
    const text = await res.text().catch(() => "");
    if (res.status === 404 || /model/i.test(text)) return { result: "model_not_found" };
    return { result: res.status === 429 || res.status >= 500 ? "unreachable" : "not_compatible" };
  } catch {
    return { result: "unreachable" };
  }
}
