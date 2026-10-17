// v1.7.1 safety: the database rules hold when called directly, not just through the app.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { admin, FUNCTIONS, ok } from "./harness.mjs";
const env = Object.fromEntries(fs.readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const URL_ = env.VITE_SUPABASE_URL, PUB = env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function student(tag) {
  const email = `e2e-rls-${tag}-${Date.now()}@example.com`;
  const { data: c } = await admin.auth.admin.createUser({ email, email_confirm: true });
  await admin.from("profiles").update({ first_name: `${tag} Lastname`, onboarded: true }).eq("user_id", c.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const { data: s } = await createClient(URL_, PUB, { auth: { persistSession: false } }).auth.verifyOtp({ email, token: link.properties.email_otp, type: "email" });
  const db = createClient(URL_, PUB, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } });
  return { uid: c.user.id, db, token: s.session.access_token };
}
const [a, b, c] = [await student("Ann"), await student("Ben"), await student("Cat")];
try {
  const subj = (await admin.from("subjects").insert({ user_id: a.uid, name: "Biology", area: "Science" }).select("id").single()).data;
  const src = (await admin.from("sources").insert({ user_id: a.uid, subject_id: subj.id, filename: "Ann's set", kind: "text", bytes: 1, page_count: 1, status: "ready" }).select("id").single()).data;
  const { data: gid } = await a.db.rpc("create_group", { p_name: "Group" });
  await b.db.rpc("join_group", { p_code: (await admin.from("groups").select("code").eq("id", gid).single()).data.code });
  await a.db.from("group_sets").insert({ group_id: gid, source_id: src.id });

  const outsiderSees = [
    (await c.db.from("groups").select("id").eq("id", gid)).data.length,
    (await c.db.from("group_members").select("user_id").eq("group_id", gid)).data.length,
    (await c.db.from("group_sets").select("id").eq("group_id", gid)).data.length,
  ];
  ok(`an outsider sees nothing of the group (${outsiderSees})`, outsiderSees.every((n) => n === 0));
  const lib = await fetch(`${FUNCTIONS}/share`, { method: "POST", headers: { Authorization: `Bearer ${c.token}`, apikey: PUB, "Content-Type": "application/json" }, body: JSON.stringify({ action: "group_sets", group_id: gid }) });
  ok("an outsider can't open the library", lib.status === 403);
  const selfAdd = await c.db.from("group_members").insert({ group_id: gid, user_id: c.uid, display_name: "Cat" });
  ok("nobody can add themselves without the code", !!selfAdd.error);
  const bSrc = (await admin.from("sources").insert({ user_id: b.uid, subject_id: (await admin.from("subjects").insert({ user_id: b.uid, name: "Bio", area: "Science" }).select("id").single()).data.id, filename: "Ben's", kind: "text", bytes: 1, page_count: 1, status: "ready" }).select("id").single()).data;
  const steal = await b.db.from("group_sets").insert({ group_id: gid, source_id: src.id });
  ok("a member can't share someone else's file", !!steal.error);
  ok("a member can share their own", !(await b.db.from("group_sets").insert({ group_id: gid, source_id: bSrc.id })).error);
  const members = (await b.db.from("group_members").select("display_name").eq("group_id", gid)).data.map((m) => m.display_name);
  ok(`members see first names only (${members})`, members.every((n) => !n.includes("Lastname")));
  const kick = await b.db.from("group_members").delete().eq("group_id", gid).eq("user_id", a.uid).select();
  ok("a member can't remove the owner", (kick.data ?? []).length === 0);
  const rename = await b.db.from("groups").update({ name: "Hacked" }).eq("id", gid).select();
  ok("a member can't rename the group", (rename.data ?? []).length === 0);
  const aSources = (await b.db.from("sources").select("id").eq("id", src.id)).data.length;
  ok("members still can't read each other's files directly", aSources === 0);
} finally {
  for (const s of [a, b, c]) await admin.auth.admin.deleteUser(s.uid);
  console.log("cleaned up");
}
