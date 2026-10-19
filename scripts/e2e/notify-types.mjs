// v1.8.9: homework due tomorrow and study group activity reach a real push subscription, once a day each,
// and their switches turn them off. (Study set ready is sent by generate; its rules are unit tested.)
import { admin, APP, FUNCTIONS, ok, run, until, waitForDeploy } from "./harness.mjs";

const fire = async () => (await fetch(`${FUNCTIONS}/send-reminders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json();
await waitForDeploy("Study group activity");
await run("notify2", async ({ p, uid, wh }) => {
  await p.context().grantPermissions(["notifications"], { origin: APP });
  await p.goto(`${APP}/settings`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Turn on reminders" }).waitFor({ timeout: 60000 });
  await p.getByRole("button", { name: "Turn on reminders" }).click();
  ok("subscribed", !!(await until(async () => (await admin.from("push_subscriptions").select("id").eq("user_id", uid).maybeSingle()).data, 30000)));
  const switches = p.locator("#notifications input[type=checkbox]");
  await switches.first().waitFor();
  ok("six switches in Settings", (await switches.count()) === 6 && await p.getByText("Study group activity").isVisible() && await p.getByText("Homework due tomorrow").isVisible());

  const tz = "America/New_York";
  const now = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(Date.now() + 86400_000));
  const prefs = { study: true, tests: true, homework: true, checkins: true, ready: true, groups: true, time: now, quiet_start: "00:00", quiet_end: "00:00", tz };
  await admin.from("profiles").update({ notify: prefs }).eq("user_id", uid);
  const logged = async (kind) => !!(await admin.from("notification_log").select("kind").eq("user_id", uid).eq("kind", kind).maybeSingle()).data;

  // Homework due tomorrow, not ticked off.
  await admin.from("events").insert({ user_id: uid, subject_id: wh.id, kind: "homework", title: "Read chapter 7", due_on: tomorrow });
  await fire();
  ok("homework due tomorrow is the evening message", await logged("homework"));

  // A classmate shares a set in a group they're both in.
  const { data: made } = await admin.auth.admin.createUser({ email: `e2e-notify2-mate-${Date.now()}@example.com`, email_confirm: true });
  const mate = made.user.id;
  try {
    const subj = (await admin.from("subjects").insert({ user_id: mate, name: "Biology", area: "Science", school_year: "2026-27", color_index: 1 }).select().single()).data;
    const src = (await admin.from("sources").insert({ user_id: mate, subject_id: subj.id, filename: "Unit 4 review", kind: "text", bytes: 1, page_count: 1, status: "ready" }).select().single()).data;
    const g = (await admin.from("groups").insert({ owner_id: mate, name: "Bio crew", code: "BCDFGHJK".split("").sort(() => Math.random() - 0.5).join("") }).select().single()).data;
    await admin.from("group_members").insert([{ group_id: g.id, user_id: mate, display_name: "Maya" }, { group_id: g.id, user_id: uid, display_name: "Test" }]);
    await admin.from("group_sets").insert({ group_id: g.id, source_id: src.id, shared_by: mate });
    await fire();
    ok("group activity reaches the other member", await logged(`group:${g.id}`));
    const before = (await admin.from("notification_log").select("kind").eq("user_id", uid)).data.length;
    await fire();
    ok("and only once a day per group", (await admin.from("notification_log").select("kind").eq("user_id", uid)).data.length === before);
    ok("the sharer isn't told about their own share", !(await admin.from("notification_log").select("kind").eq("user_id", mate).like("kind", "group:%").maybeSingle()).data);

    // Switches off: nothing of that kind.
    await admin.from("notification_log").delete().eq("user_id", uid);
    await admin.from("profiles").update({ notify: { ...prefs, homework: false, groups: false, study: false } }).eq("user_id", uid);
    await admin.from("group_sets").delete().eq("group_id", g.id);
    await admin.from("group_sets").insert({ group_id: g.id, source_id: src.id, shared_by: mate });
    await fire();
    ok("switched off: no homework or group notification", !(await logged("homework")) && !(await logged(`group:${g.id}`)));
  } finally {
    await admin.auth.admin.deleteUser(mate);
  }
}, { persistent: true });
