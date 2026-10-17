// v1.7.4: the invite message on a class page and in a group.
import { admin, APP, ok, run } from "./harness.mjs";
await run("invite", async ({ p, uid, wh }) => {
  await p.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: APP });
  await p.goto(`${APP}/subjects/${wh.id}`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Invite a classmate" }).click();
  const msg = await p.getByLabel("Message").inputValue();
  ok(`class page message names the class and the app (${msg.slice(0, 60)}…)`, /Want to study Biology together\?/.test(msg) && msg.includes("https://beta.stoga.study") && msg.endsWith("– Test"));
  await p.getByLabel("Message").fill("Hey, try this: https://beta.stoga.study");
  await p.getByRole("button", { name: "Copy" }).click();
  ok("the edited message is what gets copied", (await p.evaluate(() => navigator.clipboard.readText())) === "Hey, try this: https://beta.stoga.study");
  ok("a Text it link carries the message", (await p.getByRole("link", { name: "Text it" }).getAttribute("href")).startsWith("sms:"));
  const g = (await admin.from("groups").insert({ owner_id: uid, name: "AP Bio", code: "NVTEST" + "ABCDEFGH"[Date.now() % 8] + "Z" }).select().single()).data;
  await admin.from("group_members").insert({ group_id: g.id, user_id: uid, display_name: "Test" });
  await p.goto(`${APP}/groups/${g.id}`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Invite", exact: true }).click();
  const gm = await p.getByLabel("Message").inputValue();
  ok("group invite carries the join link", gm.includes(`/join/${g.code}`) && gm.startsWith('Join my study group "AP Bio"'));
});
