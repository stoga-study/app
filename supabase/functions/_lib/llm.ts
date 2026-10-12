// One client for every AI call. The key is a function secret and never reaches the browser.
//
// Any OpenAI-compatible provider works: set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL. The default is
// OpenAI with gpt-6-luna. Models differ in which settings they accept (GPT-5 models reject
// temperature, and count hidden reasoning against the token limit), so `profile()` translates one
// set of intentions into what each model family expects. Prompts and answer checks stay the same,
// and the tutor test suite (scripts/tutor-eval) is the gate before switching models.

export const LLM_BASE_URL = (Deno.env.get("LLM_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/$/, "");
export const LLM_MODEL = Deno.env.get("LLM_MODEL") ?? "gpt-6-luna";
/** For quick decisions (routing a message, naming a file). Defaults to the main model. */
export const LLM_FAST_MODEL = Deno.env.get("LLM_FAST_MODEL") ?? LLM_MODEL;
const PLATFORM_KEY = Deno.env.get("LLM_API_KEY") ?? Deno.env.get("OPENAI_API_KEY");

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
      model,
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
type Message = { role: "system" | "user" | "assistant"; content: string };

export class LLMError extends Error {
  /** Seconds the provider asked us to wait (rate limits), when it said. */
  retryAfter?: number;
  /** "quota" when the account is out of credit: retrying will not help. */
  kind: "rate_limit" | "quota" | "auth" | "other";
  constructor(public status: number, message: string, retryAfter?: number) {
    super(message);
    this.name = "LLMError";
    this.retryAfter = retryAfter;
    this.kind = status === 401 || status === 403 ? "auth" : status === 429 && /insufficient_quota|billing|exceeded your current quota/i.test(message) ? "quota" : status === 429 ? "rate_limit" : "other";
  }
}

/** Translate intentions into request settings for the model family. */
export function profile(model: string, effort: Effort, maxTokens: number) {
  // GPT-5 and later OpenAI reasoning models.
  const reasoningGpt = /^(openai\/)?gpt-([5-9]|\d{2})/i.test(model);
  if (reasoningGpt) {
    // GPT-5 (original) has "minimal"; GPT-5.1 and later have "none" instead.
    const original = /^(openai\/)?gpt-5(-|$)/i.test(model);
    const lightest = original ? "minimal" : "none";
    const reasoning_effort = { light: lightest, normal: "low", deep: "medium" }[effort];
    // Hidden reasoning counts against max_completion_tokens, so leave room for it.
    const headroom = { light: 1000, normal: 4000, deep: 8000 }[effort];
    return { reasoning_effort, max_completion_tokens: maxTokens + headroom } as Record<string, unknown>;
  }
  // Open models such as gpt-oss and Qwen3 on OpenAI-compatible hosts.
  const out: Record<string, unknown> = { temperature: 0.3, max_completion_tokens: maxTokens + 2000 };
  if (/gpt-oss/i.test(model)) out.reasoning_effort = effort === "deep" ? "medium" : "low";
  if (/groq\.com/.test(LLM_BASE_URL)) out.include_reasoning = false;
  return out;
}

function retryAfterOf(res: Response) {
  const ms = Number(res.headers.get("retry-after-ms"));
  if (Number.isFinite(ms) && ms > 0) return ms / 1000;
  const s = Number(res.headers.get("retry-after"));
  return Number.isFinite(s) && s > 0 ? s : undefined;
}

async function post(body: Record<string, unknown>, apiKey: string | undefined, timeoutMs: number) {
  const key = apiKey ?? PLATFORM_KEY;
  if (!key) throw new LLMError(500, "OPENAI_API_KEY (or LLM_API_KEY) is not set");
  return await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/** Ask for JSON matching `schema` (strict mode: every property required, no extra properties). */
export async function llmJson<T>(opts: {
  messages: Message[];
  schemaName: string;
  schema: Record<string, unknown>;
  effort?: Effort;
  maxTokens?: number;
  apiKey?: string;
  timeoutMs?: number;
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
  const model = opts.model ?? LLM_MODEL;
  const flex = opts.flex && /api\.openai\.com/.test(LLM_BASE_URL);
  const body = {
    model,
    ...(flex ? { service_tier: "flex" } : {}),
    messages: opts.messages,
    response_format: { type: "json_schema", json_schema: { name: opts.schemaName, strict: true, schema: opts.schema } },
    ...profile(model, opts.effort ?? "normal", opts.maxTokens ?? 2048),
  };
  for (let attempt = 0; ; attempt++) {
    const res = await post(body, opts.apiKey, opts.timeoutMs ?? 60_000);
    if (res.ok) {
      const data = await res.json();
      await recordUsage(opts.usage, model, data?.usage, !!flex);
      const choice = data?.choices?.[0];
      const text = choice?.message?.content;
      if (typeof text !== "string" || !text) {
        // A reasoning model can spend the whole budget thinking; that is worth one retry.
        if (attempt < 1 && !opts.noRetry) continue;
        throw new LLMError(502, `no content (finish_reason ${choice?.finish_reason ?? "?"})`);
      }
      return JSON.parse(text) as T;
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

/** Start a streamed answer. The caller reads OpenAI-style SSE chunks from `res.body`. */
export async function llmStream(opts: { messages: Message[]; effort?: Effort; maxTokens?: number; apiKey?: string; timeoutMs?: number; model?: string }) {
  const model = opts.model ?? LLM_MODEL;
  // include_usage adds a last chunk with the token counts, for recordUsage().
  const res = await post({ model, messages: opts.messages, stream: true, stream_options: { include_usage: true }, ...profile(model, opts.effort ?? "normal", opts.maxTokens ?? 1500) }, opts.apiKey, opts.timeoutMs ?? 90_000);
  if (!res.ok || !res.body) {
    const text = (await res.text().catch(() => "")).slice(0, 500);
    throw new LLMError(res.status, text, retryAfterOf(res));
  }
  return res;
}

/** Check a student's own key against the provider. */
export async function checkKey(key: string): Promise<"ok" | "invalid" | "unreachable"> {
  try {
    const res = await fetch(`${LLM_BASE_URL}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
    if (res.ok) return "ok";
    return res.status === 401 || res.status === 403 ? "invalid" : "unreachable";
  } catch {
    return "unreachable";
  }
}
