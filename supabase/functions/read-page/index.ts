// Reads the text on one page image: a page of a scanned PDF or a photo of notes. The app renders and
// shrinks the image on the student's device, then sends it here one page at a time.
//
// POST { image: "data:image/jpeg;base64,..." }  → { text }
//
// Pages are read before the upload is counted, so each student has a daily page allowance to keep
// costs predictable (OCR_PAGES_PER_DAY, default 150; a 20-page scan costs about a cent).
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { studentClient } from "../_lib/auth.ts";
import { corsHeaders, json } from "../_lib/cors.ts";
import { llmReadImage, LLMError, setUsageLogger } from "../_lib/llm.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
setUsageLogger((row) => admin.from("ai_usage").insert(row));

const PAGES_PER_DAY = Number(Deno.env.get("OCR_PAGES_PER_DAY") ?? 150);
const MAX_IMAGE_CHARS = 4_500_000; // about 3.3 MB of image once decoded

const PROMPT = `This is one page of a high school student's notes, a handout or a textbook: a scan or a photo.
Transcribe all of its text exactly as written, in reading order.
- Keep headings, bullet points and numbered lists on their own lines.
- Write math in plain text with Unicode symbols, like x̄ = Σx/n, σ/√n or p̂ ≥ 10. No LaTeX.
- For a table, write each row on one line with " | " between cells.
- For a diagram, graph or picture, write one short line in square brackets saying what it shows and any labels, like [Graph: supply and demand curves crossing at the equilibrium price].
- If handwriting is hard to read, give your best reading and put [?] after a word you are unsure of.
- Ignore page furniture such as page numbers and repeated headers.
Reply with only the transcription. If the page has no text at all, reply with nothing.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  const student = await studentClient(req);
  if (!student) return json(req, { error: "not_signed_in" }, 401);
  const body = await req.json().catch(() => ({}));
  const image = typeof body.image === "string" ? body.image : "";
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > MAX_IMAGE_CHARS) return json(req, { error: "bad_image" }, 400);

  // Daily page allowance, counted from the usage log.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin.from("ai_usage").select("id", { count: "exact", head: true })
    .eq("user_id", student.userId).eq("feature", "ocr_page").gte("created_at", since);
  if ((count ?? 0) >= PAGES_PER_DAY) return json(req, { error: "page_limit", limit: PAGES_PER_DAY }, 429);

  try {
    const text = await llmReadImage({ dataUrl: image, prompt: PROMPT, usage: { feature: "ocr_page", userId: student.userId } });
    return json(req, { text: text.trim() });
  } catch (e) {
    const err = e instanceof LLMError ? e : null;
    console.error("read-page", err?.status, (e instanceof Error ? e.message : String(e)).slice(0, 300));
    return json(req, { error: err?.kind === "rate_limit" ? "busy" : "unavailable" }, err?.kind === "rate_limit" ? 503 : 502);
  }
});
