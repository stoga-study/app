// Fetch a calendar link (.ics) for the student, since browsers can't read other sites' calendars.
//
// POST { url }  → { text, url }   the calendar's text, and the cleaned link to save
// Only public https addresses, checked again at every redirect; at most 3 MB and 10 seconds.
import { studentClient } from "../_lib/auth.ts";
import { corsHeaders, json } from "../_lib/cors.ts";
import { safeFeedUrl } from "../_lib/url.ts";

const MAX_BYTES = 3_000_000;

async function fetchCalendar(start: string): Promise<{ text: string } | { error: string }> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: "manual", headers: { Accept: "text/calendar, text/plain, */*", "User-Agent": "Stoga.study calendar import" }, signal: AbortSignal.timeout(10_000) });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      const safe = next ? safeFeedUrl(new URL(next, url).toString()) : null;
      if (!safe) return { error: "bad_url" };
      url = safe;
      continue;
    }
    if (!res.ok) return { error: res.status === 401 || res.status === 403 || res.status === 404 ? "not_found" : "unreachable" };
    const reader = res.body?.getReader();
    if (!reader) return { error: "unreachable" };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { await reader.cancel(); return { error: "too_big" }; }
      chunks.push(value);
    }
    const all = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) { all.set(c, at); at += c.length; }
    const text = new TextDecoder().decode(all);
    return /BEGIN:VCALENDAR/i.test(text.slice(0, 2000)) ? { text } : { error: "not_calendar" };
  }
  return { error: "unreachable" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  const student = await studentClient(req);
  if (!student) return json(req, { error: "not_signed_in" }, 401);
  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === "string" ? safeFeedUrl(body.url) : null;
  if (!url) return json(req, { error: "bad_url" }, 400);
  try {
    const out = await fetchCalendar(url);
    if ("error" in out) return json(req, out, 422);
    return json(req, { text: out.text, url });
  } catch (e) {
    console.error("calendar-fetch", e instanceof Error ? e.message : e);
    return json(req, { error: "unreachable" }, 422);
  }
});
