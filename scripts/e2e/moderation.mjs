// v1.7.3: three reports hide a group set (the owner still sees it and can restore); three hide a link.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { admin, APP, ok, otherStudent, run, until } from "./harness.mjs";
const env = Object.fromEntries(fs.readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
async function reporter(tag) {
  const email = `e2e-mod-${tag}-${Date.now()}@example.com`;
  const { data: c } = await admin.auth.admin.createUser({ email, email_confirm: true });
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const { data: s } = await createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } }).auth.verifyOtp({ email, token: link.properties.email_otp, type: "email" });
  return { uid: c.user.id, db: createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } }) };
}
await run("mod", async ({ p, uid, wh }) => {
  const src = (await admin.from("sources").insert({ user_id: uid, subject_id: wh.id, filename: "Owner's set", kind: "text", bytes: 1, page_count: 1, status: "ready" }).select().single()).data;
  const reps = [await reporter("a"), await reporter("b"), await reporter("c")];
  const member = await otherStudent("mod-m");
  try {
    // The member owns a group; the test student (owner of the set) and three reporters are in it.
    const g = (await admin.from("groups").insert({ owner_id: member.uid, name: "Group", code: "MXDTEST" + "ABCDEFGH"[Date.now() % 8] }).select().single()).data;
    await admin.from("group_members").insert([{ group_id: g.id, user_id: member.uid, display_name: "Other" }, { group_id: g.id, user_id: uid, display_name: "Test" }, ...reps.map((r, i) => ({ group_id: g.id, user_id: r.uid, display_name: `R${i}` }))]);
    const set = (await admin.from("group_sets").insert({ group_id: g.id, source_id: src.id, shared_by: uid }).select().single()).data;
    // A reporter uses the button in the app? Reporters here call the same rule directly; the test student checks the UI.
    const r1 = await reps[0].db.rpc("report_shared", { p_type: "group_set", p_target: set.id, p_reason: "inappropriate" });
    const r1b = await reps[0].db.rpc("report_shared", { p_type: "group_set", p_target: set.id, p_reason: "spam" });
    const r2 = await reps[1].db.rpc("report_shared", { p_type: "group_set", p_target: set.id, p_reason: "bullying", p_details: "mean" });
    ok("one student's repeated reports count once", r1.data === false && r1b.data === false && r2.data === false);
    const r3 = await reps[2].db.rpc("report_shared", { p_type: "group_set", p_target: set.id, p_reason: "inappropriate" });
    ok("the third student's report hides it", r3.data === true && !!(await admin.from("group_sets").select("hidden_at").eq("id", set.id).single()).data.hidden_at);
    const outsider = await reporter("x");
    const bad = await outsider.db.rpc("report_shared", { p_type: "group_set", p_target: set.id, p_reason: "spam" });
    ok("someone outside the group can't report it", !!bad.error);
    await admin.auth.admin.deleteUser(outsider.uid);
    // The group owner (member) sees it hidden, and restores it.
    await member.p.goto(`${APP}/groups/${g.id}`, { waitUntil: "networkidle" });
    await member.p.getByText("Hidden after reports").waitFor({ timeout: 15000 });
    ok("the owner sees it marked hidden", true);
    await member.p.getByRole("button", { name: "Restore" }).click();
    ok("the owner can restore it", !!(await until(async () => !(await admin.from("group_sets").select("hidden_at").eq("id", set.id).single()).data.hidden_at)));
    // A share link: three reports and it stops working.
    const link = (await admin.from("share_links").insert({ user_id: uid, source_id: src.id, token: `modtest${Date.now()}abcdefghij` }).select().single()).data;
    for (const r of reps) await r.db.rpc("report_shared", { p_type: "share_link", p_target: link.id, p_reason: "spam" });
    ok("three reports turn a link off", !!(await admin.from("share_links").select("revoked_at").eq("id", link.id).single()).data.revoked_at);
    // The report button in the app (test student reports the group's set from a member's view: the owner's own set has none).
    await p.goto(`${APP}/s/${link.token}`, { waitUntil: "networkidle" });
    ok("the turned-off link shows as not working", !!(await p.getByText("This link doesn't work anymore").waitFor({ timeout: 10000 }).then(() => true).catch(() => false)));
  } finally {
    for (const r of reps) await admin.auth.admin.deleteUser(r.uid);
    await member.cleanup();
  }
}, { expectErrors: /status of 404/ });
