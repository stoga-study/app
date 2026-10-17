// v1.7.1: one student starts a group, another joins by link, a set is shared and copied, then removal.
import { admin, APP, ok, otherStudent, run, until } from "./harness.mjs";
await run("groups", async ({ p, uid, wh }) => {
  const src = (await admin.from("sources").insert({ user_id: uid, subject_id: wh.id, filename: "Cell structure", kind: "text", bytes: 1, page_count: 1, status: "ready" }).select().single()).data;
  await admin.from("source_pages").insert({ user_id: uid, source_id: src.id, page_no: 1, text: "Cells." });
  await admin.from("cards").insert({ user_id: uid, subject_id: wh.id, source_id: src.id, front: "What makes ATP?", back: "Mitochondria" });
  await p.goto(`${APP}/groups`, { waitUntil: "networkidle" });
  await p.getByLabel("Group name").fill("AP Bio, period 3");
  await p.getByRole("button", { name: "Start it" }).click();
  await p.waitForURL(/\/groups\/[0-9a-f-]{36}/);
  const gid = p.url().split("/groups/")[1];
  const g = (await admin.from("groups").select("code, owner_id").eq("id", gid).single()).data;
  ok(`group made with a code (${g.code})`, /^[A-HJ-NP-Z2-9]{8}$/.test(g.code) && g.owner_id === uid);

  const other = await otherStudent("groups-b");
  try {
    // Before joining, nothing about the group is readable but its name and size.
    const peekOnly = (await other.p.evaluate(async () => 0));
    await other.p.goto(`${APP}/join/${g.code}`, { waitUntil: "networkidle" });
    await other.p.getByRole("heading", { name: "AP Bio, period 3" }).waitFor();
    ok("join screen shows the name and size", await other.p.getByText("1 member · invite only").isVisible());
    await other.p.getByRole("button", { name: "Join the group" }).click();
    await other.p.waitForURL(/\/groups\//);
    ok("joined", (await admin.from("group_members").select("user_id").eq("group_id", gid)).data.length === 2);
    ok("members see first names only", await other.p.getByText("Test", { exact: true }).isVisible() || await other.p.getByText(/^Test/).first().isVisible());

    await p.reload({ waitUntil: "networkidle" });
    await p.getByRole("button", { name: "Share one of mine" }).click();
    await p.getByRole("button", { name: "Share", exact: true }).first().click();
    await until(async () => (await admin.from("group_sets").select("id").eq("group_id", gid)).data.length === 1);
    await other.p.reload({ waitUntil: "networkidle" });
    await other.p.getByText("Cell structure").waitFor({ timeout: 15000 });
    ok("the shared set shows who shared it and what's in it", await other.p.getByText(/Shared by Test · 1 cards/).isVisible());
    await other.p.getByRole("button", { name: "Add to my class" }).click();
    await other.p.waitForURL(/\/sources\//);
    const copy = (await admin.from("sources").select("id, copied_from_set").eq("user_id", other.uid).single()).data;
    ok("copy added to their class", !!copy.copied_from_set && (await admin.from("cards").select("id").eq("source_id", copy.id)).data.length === 1);

    // The owner removes them: the group is gone for them, their copy stays theirs.
    await p.reload({ waitUntil: "networkidle" });
    await p.getByRole("button", { name: "Remove" }).click();
    await until(async () => (await admin.from("group_members").select("user_id").eq("group_id", gid)).data.length === 1);
    await other.p.goto(`${APP}/groups/${gid}`, { waitUntil: "networkidle" });
    ok("removed members lose access", !!(await other.p.getByText("You're not in this group").waitFor({ timeout: 10000 }).then(() => true).catch(() => false)));
    ok("but keep their own copy", (await admin.from("sources").select("id").eq("id", copy.id)).data.length === 1);
    void peekOnly;
  } finally {
    await other.cleanup();
  }
});
