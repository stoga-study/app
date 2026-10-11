// Run the tutor test conversations against the deployed tutor function, as a throwaway test student.
//
//   SUPABASE_SECRET_KEY=sb_secret_… node scripts/tutor-eval/run.mjs [report.md] [--only "name part"]
//
// Reads VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY from .env.local. Uses about 20 tutor calls of
// the platform Groq key, and waits out Groq rate limits. The test student is always deleted at the end.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { cases, pages, topics } from "./cases.mjs";

const env = Object.fromEntries(fs.readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const URL_ = env.VITE_SUPABASE_URL, PUB = env.VITE_SUPABASE_PUBLISHABLE_KEY, SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !PUB || !SECRET) throw new Error("Need .env.local and SUPABASE_SECRET_KEY");
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].toLowerCase() : null;
const reportPath = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--only") ?? "tutor-eval-report.md";

const admin = createClient(URL_, SECRET, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const words = (s) => s.split(/\s+/).filter(Boolean).length;

async function ask(token, body) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const res = await fetch(`${URL_}/functions/v1/tutor`, { method: "POST", headers: { Authorization: `Bearer ${token}`, apikey: PUB, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.headers.get("content-type")?.includes("event-stream")) {
      const j = await res.json().catch(() => ({}));
      if (j.error === "busy" || j.error === "unavailable") {
        const wait = (j.retry_after ?? 20) + 2;
        if (wait > 600) return { error: `Groq rate limit: retry in ${Math.round(wait / 60)} minutes (likely the daily token cap)` };
        console.log(`    (Groq busy, waiting ${wait}s)`);
        await sleep(wait * 1000);
        continue;
      }
      return { error: j.error ?? `http ${res.status}` };
    }
    const out = { mode: null, content: "", citations: [], thread_id: null, error: null };
    const text = await res.text();
    for (const block of text.split("\n\n")) {
      const ev = /^event: (\w+)$/m.exec(block)?.[1];
      const raw = /^data: (.*)$/m.exec(block)?.[1];
      if (!ev || !raw) continue;
      const d = JSON.parse(raw);
      if (ev === "meta") out.thread_id = d.thread_id;
      if (ev === "done") Object.assign(out, { mode: d.mode, content: d.content, citations: d.citations });
      if (ev === "error") out.error = d.error;
    }
    if (out.error === "interrupted") { await sleep(15000); continue; }
    return out;
  }
  return { error: "gave up after retries" };
}

function grade(turn, r) {
  const fails = [];
  if (r.error) return [`error: ${r.error}`];
  const c = r.content;
  if (turn.mode && !turn.mode.includes(r.mode)) fails.push(`mode ${r.mode}, wanted ${turn.mode.join("/")}`);
  if (turn.cited === true && !r.citations.length) fails.push("no citation to the notes");
  if (turn.cited === false && r.citations.length) fails.push("cited notes that do not cover this");
  if (turn.maxWords && words(c) > turn.maxWords) fails.push(`${words(c)} words, limit ${turn.maxWords}`);
  for (const m of turn.must ?? []) if (!new RegExp(m, "i").test(c)) fails.push(`missing /${m}/`);
  for (const m of turn.mustNot ?? []) if (new RegExp(m, "i").test(c)) fails.push(`contains /${m}/`);
  // House rules for every answer.
  if (/\\[a-z]+|\$[^$]+\$/.test(c)) fails.push("LaTeX");
  if (/sources don['’]t cover/i.test(c)) fails.push("boilerplate opener");
  if (/!/.test(c.replace(/\[.*?\]\(.*?\)/g, ""))) fails.push("exclamation mark");
  if (/\p{Extended_Pictographic}/u.test(c)) fails.push("emoji");
  return fails;
}

const email = `tutor-eval-${Date.now()}@example.com`;
const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, email_confirm: true });
if (cErr) throw cErr;
const uid = created.user.id;
const report = [`# Tutor eval, ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC\n`];
let passed = 0, total = 0;
try {
  const { data: subject } = await admin.from("subjects").insert({ user_id: uid, name: "AP Statistics", area: "Math" }).select("id").single();
  const { data: source } = await admin.from("sources").insert({ user_id: uid, subject_id: subject.id, filename: "Week 5: Sampling Distributions", kind: "pdf", page_count: pages.length, status: "ready" }).select("id").single();
  const { error: pErr } = await admin.from("source_pages").insert(pages.map((text, i) => ({ user_id: uid, source_id: source.id, page_no: i + 1, text })));
  if (pErr) throw pErr;
  await admin.from("notes_sections").insert(topics.map((title, i) => ({ user_id: uid, source_id: source.id, position: i, title, body_md: "", pages: [] })));
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const anon = createClient(URL_, PUB, { auth: { persistSession: false } });
  const { data: sess, error: sErr } = await anon.auth.verifyOtp({ email, token: link.properties.email_otp, type: "email" });
  if (sErr) throw sErr;
  const token = sess.session.access_token;

  for (const c of cases.filter((x) => !only || x.name.toLowerCase().includes(only))) {
    console.log(`\n${c.name}`);
    report.push(`\n## ${c.name}\n`);
    let thread = null, lastSay = null, level = 1;
    for (const turn of c.turns) {
      const body = turn.say
        ? { subject_id: subject.id, question: turn.say, hint_level: 1, thread_id: thread }
        : { subject_id: subject.id, question: lastSay, hint_level: turn.next, thread_id: thread, followup: true };
      if (turn.say) lastSay = turn.say;
      level = turn.say ? 1 : turn.next;
      const r = await ask(token, body);
      thread = r.thread_id ?? thread;
      const fails = grade(turn, r);
      total++; if (!fails.length) passed++;
      console.log(`  ${fails.length ? "✗" : "✓"} ${turn.say ? `"${turn.say.slice(0, 60)}"` : `[button: ${level === 3 ? "full explanation" : `hint ${level}`}]`} → ${r.mode ?? "-"}${fails.length ? `  ${fails.join("; ")}` : ""}`);
      report.push(`**Student:** ${turn.say ?? `*(pressed ${level === 3 ? "Show full explanation" : `Show hint ${level}`})*`}\n\n**Tutor** \`${r.mode}\`${r.citations?.length ? ` cites p.${r.citations.map((x) => x.page).join(", ")}` : ""}${fails.length ? ` ✗ ${fails.join("; ")}` : " ✓"}\n\n> ${(r.content || r.error || "").replace(/\n/g, "\n> ")}\n`);
      await sleep(4000);
    }
  }
} finally {
  await admin.auth.admin.deleteUser(uid);
  report.splice(1, 0, `**${passed} of ${total} turns passed the automatic checks.**\n`);
  fs.writeFileSync(reportPath, report.join("\n"));
  console.log(`\n${passed}/${total} passed. Transcript: ${reportPath}`);
}
