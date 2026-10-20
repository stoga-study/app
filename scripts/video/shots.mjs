// Real app screens for the updates video: the example student with a few weeks of realistic activity.
//   node scripts/video/shots.mjs <outdir>        (E2E_APP=http://localhost:5199 to use a local dev server)
//   THEME=dark for the dark-mode cut. Phone screens are an iPhone Pro's 402-point width, minus the status bar and
//   home-indicator strips the device frame draws itself.
// Everything seeded belongs to throwaway accounts that are deleted at the end. Ideas-board requests are visible to
// everyone once approved, so they exist only for the seconds around their screenshot.
import fs from "node:fs";
import path from "node:path";
import { admin, APP, run } from "../e2e/harness.mjs";
import { seedSample } from "../e2e/sample.mjs";

const OUT = process.argv[2] ?? "video-shots";
fs.mkdirSync(OUT, { recursive: true });
const day = (n) => new Date(Date.now() + n * 86400_000);
const iso = (d) => d.toISOString();

async function showcase(uid, wh) {
  const s = await seedSample(uid, wh);
  const { data: cards } = await admin.from("cards").select("id").eq("user_id", uid).limit(38);
  // Four weeks of studying, on most days.
  const reviews = [];
  for (let d = 27; d >= 0; d--) {
    if ([24, 20, 13, 6].includes(d)) continue;
    const n = 6 + ((d * 7) % 17);
    for (let k = 0; k < n; k++) {
      const at = new Date(day(-d).setHours(16 + (k % 5), (k * 11) % 60, 0, 0));
      reviews.push({ user_id: uid, card_id: cards[(d * 3 + k) % cards.length].id, rating: k % 7 === 0 ? 1 : 3, state: 2, reviewed_at: iso(at) });
    }
  }
  for (let i = 0; i < reviews.length; i += 200) await admin.from("card_reviews").insert(reviews.slice(i, i + 200));
  await admin.from("cards").update({ state: 2, stability: 24, reps: 6 }).eq("user_id", uid).in("id", cards.slice(0, 22).map((c) => c.id));
  await admin.from("quiz_attempts").insert({ user_id: uid, quiz_id: s.qz.id, total: 2, correct: 2, answers: [{ q: 0, ok: true }, { q: 1, ok: true }], created_at: iso(day(-2)), finished_at: iso(day(-2)) });

  // A tutor conversation: a hint first, then checking the student's answer, both citing their page.
  const thread = (await admin.from("chat_threads").insert({ user_id: uid, subject_id: wh.id, title: "Standard error" }).select().single()).data;
  const cite = [{ key: "S1", source_id: s.src.id, filename: "Sampling distributions notes", kind: "pdf", page: 2 }];
  const t0 = Date.now() - 3600_000;
  await admin.from("chat_messages").insert([
    // Every row has the same fields: a bulk insert with mismatched keys fails as a whole.
    { user_id: uid, thread_id: thread.id, role: "user", mode: null, hint_level: null, citations: [], content: "For σ = 15 and n = 25, how do I find the standard error?", created_at: iso(new Date(t0)) },
    { user_id: uid, thread_id: thread.id, role: "assistant", mode: "hint", hint_level: 1, content: "Your notes give the formula for this [S1 p.2]. It divides σ by something that depends on n. What is √25?", citations: cite, created_at: iso(new Date(t0 + 20_000)) },
    { user_id: uid, thread_id: thread.id, role: "user", mode: null, hint_level: null, citations: [], content: "is it 15/5 = 3?", created_at: iso(new Date(t0 + 60_000)) },
    { user_id: uid, thread_id: thread.id, role: "assistant", mode: "check", hint_level: 1, content: "Yes. SE = σ/√n = 15/√25 = 3 [S1 p.2]. That's how far a sample mean of 25 usually lands from the true mean.", citations: cite, created_at: iso(new Date(t0 + 80_000)) },
  ]);

  // The coach planned the week and added the test.
  await admin.from("profiles").update({
    coach_chat: [
      { role: "user", content: "my stats midterm got moved to thursday, can you plan my week" },
      { role: "assistant", content: "Done, Ava. Thursday gives you three good nights. Tonight: 20 flashcards from Unit 4. Wednesday: the practice quiz, then go over anything you miss. You've got this.", steps: [{ id: "s1", label: "Checked your calendar", status: "done" }, { id: "s2", label: "Checked how you're doing in AP Statistics", status: "done" }], actions: [{ type: "update_event", summary: "Moved AP Statistics midterm to Thu, Oct 22", ok: true }], links: [{ label: "Review AP Statistics cards", href: `/review/session?subject=${wh.id}` }] },
    ],
    coach_chat_at: iso(new Date()),
  }).eq("user_id", uid);

  const note = crypto.randomUUID();
  await admin.from("student_notes").insert({ id: note, user_id: uid, subject_id: wh.id, unit_id: s.unit.id, source_id: s.src.id, title: "My CLT review", body: "# The central limit theorem\n\n- For large samples, the sample mean is approximately normal.\n- Works when n ≥ 30, or sooner if the population is normal.\n- **SE = σ / √n**: bigger samples, smaller spread.\n\nQuestion for Ms. Rivera: why 30?" });

  // A classmate and a study group with a shared set.
  const { data: made } = await admin.auth.admin.createUser({ email: `e2e-video-mate-${Date.now()}@example.com`, email_confirm: true });
  const mate = made.user.id;
  await admin.from("profiles").update({ first_name: "Maya", onboarded: true, graduation_year: 2029 }).eq("user_id", mate);
  const ms = (await admin.from("subjects").insert({ user_id: mate, name: "AP Statistics", area: "Math", school_year: "2026-27", color_index: 1 }).select().single()).data;
  const msrc = (await admin.from("sources").insert({ user_id: mate, subject_id: ms.id, filename: "Unit 4 review sheet", kind: "pdf", bytes: 1, page_count: 3, status: "ready" }).select().single()).data;
  await admin.from("notes_sections").insert({ user_id: mate, source_id: msrc.id, position: 0, title: "Unit 4 at a glance", body_md: "Sampling distributions.", pages: [1] });
  await admin.from("cards").insert(Array.from({ length: 18 }, (_, i) => ({ user_id: mate, subject_id: ms.id, source_id: msrc.id, front: `Review ${i + 1}`, back: "x", state: 0, reps: 0, hidden: false })));
  const code = Array.from({ length: 8 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
  const g = (await admin.from("groups").insert({ owner_id: uid, name: "Stats study group", code }).select().single()).data;
  await admin.from("group_members").insert([{ group_id: g.id, user_id: uid, display_name: "Ava" }, { group_id: g.id, user_id: mate, display_name: "Maya" }]);
  await admin.from("group_sets").insert({ group_id: g.id, source_id: msrc.id, shared_by: mate });

  const token = "V" + crypto.randomUUID().replace(/-/g, "");
  await admin.from("support_links").insert({ user_id: uid, token, label: "Mom", relation: "parent", views: 3, last_viewed_at: iso(day(-1)) });
  await admin.from("goals").insert({ user_id: uid, kind: "cards", target: 120 });
  return { ...s, thread, note, g, token, mate };
}

const DARK = process.env.THEME === "dark";
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const shot = async (p, name, url, before) => {
  if (ONLY && !ONLY.has(name)) return;
  await p.goto(APP + url, { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  if (before) await before(p);
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log("shot", name);
};
const scrollTo = (sel) => async (p) => { await p.locator(sel).first().scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -24)); };

await run("video", async ({ p, uid, wh }) => {
  await admin.from("profiles").update({ first_name: "Ava" }).eq("user_id", uid);
  const s = await showcase(uid, wh);
  await p.emulateMedia({ colorScheme: DARK ? "dark" : "light" });
  try {
    await shot(p, "p-home", "/");
    await shot(p, "p-studyset", `/sources/${s.src.id}`);
    await shot(p, "p-upload", "/upload");
    await shot(p, "p-review", `/review/session?subject=${wh.id}`, (q) => q.getByRole("button", { name: "Show answer" }).click().catch(() => {}));
    await shot(p, "p-note", `/notes/${s.note}`);
    await shot(p, "p-tutor", `/tutor/${wh.id}?thread=${s.thread.id}`, (q) => q.getByText("That's how far a sample mean").waitFor({ timeout: 20000 }));
    await shot(p, "p-search", "/search", async (q) => { await q.locator("main input").first().fill("standard error"); await q.keyboard.press("Enter"); await q.waitForTimeout(2500); });
    await shot(p, "p-quiz", `/quiz/${s.qz.id}`, async (q) => { await q.getByRole("radio").nth(1).click(); await q.getByRole("button", { name: "Check answer" }).click(); await q.getByText(/Not quite|Correct/).first().waitFor(); });
    await shot(p, "p-calendar", "/calendar");
    await shot(p, "p-plan", "/calendar?view=plan");
    await shot(p, "p-exam", `/exam/${s.ev[0].id}`);
    await shot(p, "p-coach", "/coach");
    await shot(p, "p-progress", "/progress");
    await shot(p, "p-progress-history", "/progress", scrollTo("text=Study history"));
    await shot(p, "p-group", `/groups/${s.g.id}`);
    await shot(p, "p-privacy", "/settings#privacy", scrollTo("#privacy"));
    await shot(p, "p-data", "/settings#data", scrollTo("#data"));
    await shot(p, "p-supportlink", "/settings#support", scrollTo("#support"));
    await shot(p, "p-support", `/support/${s.token}`);
    await shot(p, "p-feedback", "/calendar", async (q) => { await q.getByRole("button", { name: "Send feedback" }).first().click(); await q.getByRole("radio", { name: "An idea" }).click(); await q.locator("textarea").fill("A week view in the calendar would be great!"); });
    // The ideas board: approved requests exist only around this screenshot.
    const reqs = (await admin.from("feature_requests").insert([
      { user_id: s.mate, title: "A week view in the calendar", body: "See the whole week at once.", status: "planned" },
      { user_id: uid, title: "Dark mode for the review pack", body: "", status: "open" },
      { user_id: s.mate, title: "Import from Google Docs", body: "My notes are in Docs.", status: "open" },
    ]).select()).data;
    await admin.from("feature_votes").insert([{ request_id: reqs[0].id, user_id: uid }, { request_id: reqs[0].id, user_id: s.mate }, { request_id: reqs[2].id, user_id: uid }]);
    try { await shot(p, "p-ideas", "/requests"); } finally { await admin.from("feature_requests").delete().in("id", reqs.map((r) => r.id)); }
    await shot(p, "p-updates", "/updates");

    await p.setViewportSize({ width: 1440, height: 900 });
    await shot(p, "d-home", "/");
    await shot(p, "d-calendar", "/calendar");
    await shot(p, "d-plans", "/plans", scrollTo("#funding"));
    await shot(p, "d-progress", "/progress");
  } finally {
    await admin.auth.admin.deleteUser(s.mate);
    await admin.from("feedback").delete().eq("user_id", uid);
  }
}, { width: 402, height: 798, scale: 3 });
