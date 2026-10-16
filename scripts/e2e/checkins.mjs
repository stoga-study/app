// v1.5.5: rough-quiz, comeback and quiet check-ins reach a real push subscription, once an evening.
import { admin, APP, FUNCTIONS, ok, run, until, waitForDeploy } from "./harness.mjs";
const fire = async () => (await fetch(`${FUNCTIONS}/send-reminders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json();
await waitForDeploy("Check-ins from your coach");
await run("checkin", async ({ p, uid, wh }) => {
  await p.context().grantPermissions(["notifications"], { origin: APP });
  await p.goto(`${APP}/settings`, { waitUntil: "networkidle" });
  // A fresh profile installs the service worker first; give it time.
  await p.getByRole("button", { name: "Turn on reminders" }).waitFor({ timeout: 60000 });
  await p.getByRole("button", { name: "Turn on reminders" }).click();
  ok("subscribed", !!(await until(async () => (await admin.from("push_subscriptions").select("id").eq("user_id", uid).maybeSingle()).data, 30000)));
  const tz = "America/New_York";
  const now = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  await admin.from("profiles").update({ coach: { name: "Juno" }, notify: { study: true, tests: true, checkins: true, time: now, quiet_start: "00:00", quiet_end: "00:00", tz } }).eq("user_id", uid);
  const reset = () => admin.from("notification_log").delete().eq("user_id", uid);
  const kinds = async () => (await admin.from("notification_log").select("kind, variant").eq("user_id", uid).neq("kind", "evening")).data;
  const daysAgo = (d) => new Date(Date.now() - d * 86400_000).toISOString();
  const local = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(Date.now() + d * 86400_000));

  const qz = (await admin.from("quizzes").insert({ user_id: uid, subject_id: wh.id, title: "Cells quiz" }).select().single()).data;
  const att = (await admin.from("quiz_attempts").insert({ user_id: uid, quiz_id: qz.id, total: 10, correct: 4, answers: [{ q: 1 }], finished_at: new Date().toISOString() }).select().single()).data;
  let r = await fire();
  ok(`rough quiz -> check-in (${JSON.stringify(await kinds())})`, r.sent >= 1 && (await kinds()).some((k) => k.kind === "rough"));

  await reset();
  await admin.from("quiz_attempts").delete().eq("id", att.id);
  const card = (await admin.from("cards").insert({ user_id: uid, subject_id: wh.id, front: "Q", back: "A", due: daysAgo(-5), state: 2 }).select().single()).data;
  await admin.from("card_reviews").insert({ user_id: uid, card_id: card.id, rating: 3, state: 2, reviewed_at: daysAgo(3) });
  const ev = (await admin.from("events").insert({ user_id: uid, subject_id: wh.id, kind: "test", title: "Bio test", due_on: local(3) }).select().single()).data;
  r = await fire();
  ok(`test close + away -> comeback (${JSON.stringify(await kinds())})`, r.sent >= 1 && (await kinds()).some((k) => k.kind === "comeback"));

  await reset();
  await admin.from("events").delete().eq("id", ev.id);
  await admin.from("card_reviews").delete().eq("user_id", uid);
  await admin.from("card_reviews").insert({ user_id: uid, card_id: card.id, rating: 3, state: 2, reviewed_at: daysAgo(5) });
  r = await fire();
  ok(`quiet stretch -> quiet check-in (${JSON.stringify(await kinds())})`, r.sent >= 1 && (await kinds()).some((k) => k.kind === "quiet"));
  r = await fire();
  ok("still only one an evening", r.sent === 0);
}, { persistent: true });
