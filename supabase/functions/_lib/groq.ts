// Groq chat completions (OpenAI-compatible). The key is a function secret and never reaches the browser.
// Docs checked 2026-10-11: strict json_schema output is supported for openai/gpt-oss-120b;
// reasoning_effort is low | medium | high; include_reasoning=false drops the reasoning text.

export const GROQ_MODEL = Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b";

type Message = { role: "system" | "user" | "assistant"; content: string };

export class GroqError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "GroqError";
  }
}

/** Ask for JSON matching `schema` (strict mode: every property required, no extra properties). */
export async function groqJson<T>(opts: {
  messages: Message[];
  schemaName: string;
  schema: Record<string, unknown>;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  apiKey?: string;
  timeoutMs?: number;
}): Promise<T> {
  const key = opts.apiKey ?? Deno.env.get("GROQ_API_KEY");
  if (!key) throw new GroqError(500, "GROQ_API_KEY is not set");
  const body = JSON.stringify({
    model: GROQ_MODEL,
    messages: opts.messages,
    response_format: { type: "json_schema", json_schema: { name: opts.schemaName, strict: true, schema: opts.schema } },
    reasoning_effort: opts.effort ?? "low",
    include_reasoning: false,
    max_completion_tokens: opts.maxTokens ?? 2048,
    temperature: 0.3,
  });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text !== "string") throw new GroqError(502, "Groq returned no content");
      return JSON.parse(text) as T;
    }
    const text = (await res.text()).slice(0, 500);
    // Retry rate limits and server errors once, and an occasional empty structured output twice.
    const retriable = res.status === 429 || res.status >= 500 || (res.status === 400 && text.includes("json_validate_failed"));
    if (retriable && attempt < (res.status === 400 ? 2 : 1)) {
      await new Promise((r) => setTimeout(r, res.status === 400 ? 200 : Number(res.headers.get("retry-after") ?? 1) * 1000));
      continue;
    }
    throw new GroqError(res.status, text);
  }
}
