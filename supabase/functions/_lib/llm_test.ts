// Run: DENO_NO_PACKAGE_JSON=1 npx deno@2 test --allow-env supabase/functions/_lib/llm_test.ts
// The platform is pointed at Mercury and fetch is replaced, so nothing goes over the network.
import { assertEquals } from "jsr:@std/assert@1.0.13";

Deno.env.set("LLM_BASE_URL", "https://api.inceptionlabs.ai/v1");
Deno.env.set("LLM_MODEL", "mercury-2.5");
Deno.env.set("LLM_API_KEY", "inception-test");
Deno.env.set("OPENAI_API_KEY", "openai-test");
const { profile, llmJson, llmReadImage, llmStream } = await import("./llm.ts");

type Call = { url: string; key: string; model: string };
function fakeFetch(answer: (c: Call) => Response) {
  const calls: Call[] = [];
  globalThis.fetch = ((url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const c = { url, key: String((init.headers as Record<string, string>).Authorization).slice(7), model: body.model };
    calls.push(c);
    return Promise.resolve(answer(c));
  }) as typeof fetch;
  return calls;
}
const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }], usage: {} }), { status: 200 });

Deno.test("Mercury gets reasoning effort, and room for its reasoning", () => {
  assertEquals(profile("mercury-2.5", "light", 500, "https://api.inceptionlabs.ai/v1"), { reasoning_effort: "low", max_tokens: 1500 });
  assertEquals(profile("mercury-2.5", "deep", 500, "https://api.inceptionlabs.ai/v1"), { reasoning_effort: "high", max_tokens: 8500 });
});

Deno.test("text calls go to Mercury", async () => {
  const calls = fakeFetch(() => ok('{"a":1}'));
  assertEquals(await llmJson<{ a: number }>({ messages: [{ role: "user", content: "hi" }], schemaName: "x", schema: {} }), { a: 1 });
  assertEquals(calls.map((c) => [c.url, c.key, c.model]), [["https://api.inceptionlabs.ai/v1/chat/completions", "inception-test", "mercury-2.5"]]);
});

Deno.test("if Mercury fails (credit gone), the call is answered by OpenAI", async () => {
  const calls = fakeFetch((c) => (c.url.includes("inceptionlabs") ? new Response('{"error":"insufficient credit"}', { status: 402 }) : ok('{"a":2}')));
  assertEquals(await llmJson<{ a: number }>({ messages: [{ role: "user", content: "hi" }], schemaName: "x", schema: {} }), { a: 2 });
  assertEquals(calls.at(-1), { url: "https://api.openai.com/v1/chat/completions", key: "openai-test", model: "gpt-6-luna" });
});

Deno.test("streams fall back too", async () => {
  const calls = fakeFetch((c) => (c.url.includes("inceptionlabs") ? new Response("down", { status: 503 }) : new Response("data: [DONE]\n\n", { status: 200 })));
  const { model } = await llmStream({ messages: [{ role: "user", content: "hi" }] });
  assertEquals(model, "gpt-6-luna");
  assertEquals(calls.at(-1)?.key, "openai-test");
});

Deno.test("a student's own key never falls back to ours", async () => {
  const calls = fakeFetch(() => new Response("bad key", { status: 401 }));
  let threw = false;
  try {
    await llmJson({ messages: [{ role: "user", content: "hi" }], schemaName: "x", schema: {}, own: { apiKey: "student", baseUrl: "https://api.example.org/v1", model: "m" } });
  } catch { threw = true; }
  assertEquals(threw, true);
  assertEquals(calls.every((c) => c.key === "student"), true);
});

Deno.test("images go to OpenAI, since Mercury reads text only", async () => {
  const calls = fakeFetch(() => ok("page text"));
  assertEquals(await llmReadImage({ dataUrl: "data:image/png;base64,AA==", prompt: "read" }), "page text");
  assertEquals(calls.map((c) => [c.url, c.key, c.model]), [["https://api.openai.com/v1/chat/completions", "openai-test", "gpt-6-luna"]]);
});

Deno.test("TUTOR_MODEL puts one function on its own model, same provider and key", async () => {
  const { useModelFrom } = await import("./llm.ts");
  Deno.env.set("TUTOR_MODEL", "mercury-3");
  useModelFrom("TUTOR_MODEL");
  const calls = fakeFetch(() => ok('{"a":3}'));
  await llmJson({ messages: [{ role: "user", content: "hi" }], schemaName: "x", schema: {} });
  assertEquals(calls.map((c) => [c.url, c.key, c.model]), [["https://api.inceptionlabs.ai/v1/chat/completions", "inception-test", "mercury-3"]]);
});
