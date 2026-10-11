// The Stoga.study tutor: hint-first answers grounded in the student's own pages, streamed as SSE.
//
// POST { subject_id, question, hint_level: 1|2|3, thread_id?, followup? }  → text/event-stream
//   events: meta { thread_id, sources, uncovered } · delta { text } · done { message_id, content, citations } · error { error }
// POST { mode: "card", message_id }  → { card }   turn a tutor answer into a flashcard
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { studentClient } from "../_lib/auth.ts";
import { corsHeaders, json } from "../_lib/cors.ts";
import { GROQ_MODEL, groqJson } from "../_lib/groq.ts";
import { cleanText, plainMath } from "../_lib/study.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const MAX_Q = 2000;
const STOP = new Set("a an and are as at be but by can do does for from how i in is it of on or so that the this to was what when where which who why with you your me my explain".split(" "));

const LEVELS: Record<number, string> = {
  1: `This is HINT 1 of 3. Write 2 or 3 short sentences, under 50 words in total. Point to the idea or the part of their notes that holds the answer, then ask ONE guiding question. Do NOT explain the reasoning, do NOT state how things change or why, and do NOT give the answer. The student should still have to think.`,
  2: `This is HINT 2 of 3. Under 90 words. Name the rule, formula or definition that applies and set up the first step, then stop and let the student finish. Do not state the conclusion or the final answer.`,
  3: `This is the FULL EXPLANATION. Under 220 words: the idea in plain words, one short worked example when it helps, and the answer. Use short paragraphs.`,
};

function system(level: number, hasSources: boolean) {
  return `You are the Stoga.study tutor for a high school student. You help them learn, not just finish.
${LEVELS[level] ?? LEVELS[1]}
Rules:
- Ground everything in the student's sources below. When sources are given, cite at least one marker, exactly as written, like [S1 p.12], right after the sentence it supports. Only use markers that appear in the sources. Never invent a citation.
- ${hasSources ? "If the sources do not cover the question, begin with exactly: \"Your sources don't cover this. Here's general knowledge:\" and then answer briefly without citations." : "There are no matching sources. Begin with exactly: \"Your sources don't cover this. Here's general knowledge:\" and answer briefly without citations."}
- If you are not sure, say so and suggest where in their notes to check.
- Academic integrity: never write graded work for them (essays, answers to submit, take-home tests). Offer an outline, a hint or feedback on their own attempt instead.
- Plain, warm, direct sentences. No hype, no exclamation marks, no emoji. You may use **bold** and "- " bullets.
- Math is written inline in plain text with Unicode, for example: SE = σ/√n, so with σ = 12 and n = 36, SE = 12/6 = 2. Never use LaTeX, backslashes, dollar signs or equations on their own lines.`;
}

type Src = { key: string; source_id: string; filename: string; kind: string; pages: number[] };

/** Rank the subject's pages for the question (any of its words), as the student, so RLS applies. */
async function retrieve(db: ReturnType<typeof createClient>, subjectId: string, question: string) {
  const words = [...new Set(question.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])].filter((w) => !STOP.has(w)).slice(0, 12);
  if (!words.length) return [];
  const { data, error } = await db.rpc("search_pages", { p_subject: subjectId, p_query: words.join(" or "), p_limit: 6 });
  if (error) throw error;
  return (data ?? []) as { source_id: string; filename: string; page_no: number; text: string; rank: number }[];
}

/** Keep only citations that point at pages the model was given; drop the rest. */
function checkCitations(text: string, sources: Src[]) {
  const used: { key: string; source_id: string; filename: string; kind: string; page: number }[] = [];
  const cleaned = text.replace(/\s*\[S(\d+)\s*(?:p\.?|pp\.?|page|part)?\s*(\d+)\]/gi, (m, s, p) => {
    const src = sources.find((x) => x.key === `S${s}`);
    const page = Number(p);
    if (!src || !src.pages.includes(page)) return "";
    if (!used.some((u) => u.source_id === src.source_id && u.page === page)) used.push({ key: src.key, source_id: src.source_id, filename: src.filename, kind: src.kind, page });
    return m;
  });
  const tidy = plainMath(cleaned).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { cleaned: tidy, used };
}

async function makeCard(req: Request, student: { db: ReturnType<typeof createClient>; userId: string }, messageId: string) {
  const { data: msg } = await student.db.from("chat_messages").select("id, thread_id, content, citations, role, created_at").eq("id", messageId).maybeSingle();
  if (!msg || msg.role !== "assistant") return json(req, { error: "not_found" }, 404);
  const [{ data: thread }, { data: prior }] = await Promise.all([
    student.db.from("chat_threads").select("subject_id").eq("id", msg.thread_id).single(),
    student.db.from("chat_messages").select("content").eq("thread_id", msg.thread_id).eq("role", "user").lte("created_at", msg.created_at).order("created_at", { ascending: false }).limit(1),
  ]);
  const out = await groqJson<{ front: string; back: string }>({
    schemaName: "card",
    schema: { type: "object", additionalProperties: false, required: ["front", "back"], properties: { front: { type: "string" }, back: { type: "string" } } },
    messages: [
      { role: "system", content: "Turn this tutoring exchange into one flashcard. Front: a clear question. Back: a short, complete answer (one or two sentences or a formula). Plain text, Unicode math, no LaTeX, no citations." },
      { role: "user", content: `Student asked: ${prior?.[0]?.content ?? ""}\n\nTutor answered: ${msg.content}` },
    ],
    maxTokens: 1024,
  });
  const front = cleanText(out.front, 300), back = cleanText(out.back, 600);
  if (!front || !back) return json(req, { error: "card_failed" }, 502);
  const cites = (msg.citations as { source_id: string; page: number }[]) ?? [];
  const sameSource = cites.length && cites.every((c) => c.source_id === cites[0].source_id);
  const { data: card, error } = await student.db.from("cards")
    .insert({ subject_id: thread!.subject_id, front, back, source_id: sameSource ? cites[0].source_id : null, pages: sameSource ? [...new Set(cites.map((c) => c.page))] : [] })
    .select("id, front, back").single();
  if (error) throw error;
  return json(req, { card });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  const student = await studentClient(req);
  if (!student) return json(req, { error: "not_signed_in" }, 401);
  const body = await req.json().catch(() => ({}));

  if (body.mode === "card") {
    try {
      return await makeCard(req, student, String(body.message_id ?? ""));
    } catch (e) {
      console.error("tutor card", e instanceof Error ? e.message : e);
      return json(req, { error: "card_failed" }, 502);
    }
  }

  const question = cleanText(body.question, MAX_Q);
  const level = [1, 2, 3].includes(body.hint_level) ? body.hint_level : 1;
  if (!question || typeof body.subject_id !== "string") return json(req, { error: "question_required" }, 400);
  const { data: subject } = await student.db.from("subjects").select("id, name").eq("id", body.subject_id).maybeSingle();
  if (!subject) return json(req, { error: "not_found" }, 404);

  // Allowance: one message per answer. Students with their own key are not limited.
  const { data: ownKey } = await admin.rpc("read_api_key", { p_user: student.userId });
  const apiKey = typeof ownKey === "string" && ownKey ? ownKey : undefined;
  const { data: allowed, error: allowErr } = await admin.rpc("consume_allowance", { p_user: student.userId, p_kind: "tutor_message", p_byok: !!apiKey });
  if (allowErr) return json(req, { error: "unavailable" }, 503);
  if (!allowed) {
    const { data: status } = await student.db.rpc("allowance_status");
    const row = (status ?? []).find((r: { kind: string }) => r.kind === "tutor_message");
    return json(req, { error: "limit", used: row?.used, limit: row?.limit, resets_at: row?.resets_at }, 429);
  }
  const refund = () => admin.rpc("refund_allowance", { p_user: student.userId, p_kind: "tutor_message" });

  try {
    // Thread and history.
    let threadId: string | null = typeof body.thread_id === "string" ? body.thread_id : null;
    if (threadId) {
      const { data: t } = await student.db.from("chat_threads").select("id").eq("id", threadId).eq("subject_id", subject.id).maybeSingle();
      if (!t) threadId = null;
    }
    if (!threadId) {
      const { data: t, error } = await student.db.from("chat_threads").insert({ subject_id: subject.id, title: question.slice(0, 80) }).select("id").single();
      if (error) throw error;
      threadId = t.id;
    }
    const { data: history } = await student.db.from("chat_messages").select("role, content").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(8);
    if (!body.followup) await student.db.from("chat_messages").insert({ thread_id: threadId, role: "user", content: question, hint_level: level });

    // Sources.
    const hits = await retrieve(student.db, subject.id, question);
    const sources: Src[] = [];
    const blocks: string[] = [];
    for (const h of hits) {
      let s = sources.find((x) => x.source_id === h.source_id);
      if (!s) {
        s = { key: `S${sources.length + 1}`, source_id: h.source_id, filename: h.filename, kind: "pdf", pages: [] };
        sources.push(s);
      }
      s.pages.push(h.page_no);
      blocks.push(`[${s.key} p.${h.page_no}] (${h.filename})\n${h.text.slice(0, 2500)}`);
    }
    if (sources.length) {
      const { data: kinds } = await student.db.from("sources").select("id, kind").in("id", sources.map((s) => s.source_id));
      for (const k of kinds ?? []) { const s = sources.find((x) => x.source_id === k.id); if (s) s.kind = k.kind; }
    }

    const messages = [
      { role: "system", content: system(level, sources.length > 0) },
      ...((history ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))),
      { role: "user", content: `Class: ${subject.name}\n\nSources:\n${blocks.join("\n\n") || "(none)"}\n\nQuestion: ${question}${body.followup ? `\n\n(The student asked for ${level === 3 ? "the full explanation" : `hint ${level}`}.)` : ""}` },
    ];

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey ?? Deno.env.get("GROQ_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: GROQ_MODEL, messages, stream: true, reasoning_effort: level === 3 ? "medium" : "low", include_reasoning: false, temperature: 0.3, max_completion_tokens: 2048 }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok || !res.body) {
      await refund();
      const ra = Number(res.headers.get("retry-after"));
      return json(req, { error: res.status === 401 ? "key_invalid" : res.status === 429 ? "busy" : "unavailable", retry_after: Number.isFinite(ra) ? ra : undefined }, res.status === 429 ? 503 : 502);
    }

    const enc = new TextEncoder();
    const send = (c: ReadableStreamDefaultController, event: string, data: unknown) => c.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    const publicSources = sources.map(({ key, source_id, filename, kind, pages }) => ({ key, source_id, filename, kind, pages }));
    const stream = new ReadableStream({
      async start(controller) {
        send(controller, "meta", { thread_id: threadId, sources: publicSources, uncovered: sources.length === 0 });
        let full = "";
        try {
          const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
          let buf = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += value;
            let nl;
            while ((nl = buf.indexOf("\n")) >= 0) {
              const line = buf.slice(0, nl).trim();
              buf = buf.slice(nl + 1);
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (payload === "[DONE]") continue;
              const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta) {
                full += delta;
                send(controller, "delta", { text: delta });
              }
            }
          }
          const { cleaned, used } = checkCitations(full, sources);
          if (!cleaned) throw new Error("empty answer");
          const { data: saved, error } = await student.db.from("chat_messages")
            .insert({ thread_id: threadId, role: "assistant", content: cleaned, hint_level: level, citations: used }).select("id").single();
          if (error) throw error;
          await student.db.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
          send(controller, "done", { message_id: saved.id, content: cleaned, citations: used });
        } catch (e) {
          console.error("tutor stream", e instanceof Error ? e.message : e);
          await refund();
          send(controller, "error", { error: "interrupted" });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { ...corsHeaders(req), "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  } catch (e) {
    console.error("tutor", e instanceof Error ? e.message : e);
    await refund();
    return json(req, { error: "unavailable" }, 502);
  }
});
