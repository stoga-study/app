// v1.7.2: editing a group's set together: edit, history, undo, undo refused after a newer edit, lock.
import { admin, APP, FUNCTIONS, ok, otherStudent, run, until } from "./harness.mjs";
await run("gedit", async ({ p, uid, wh }) => {
  const src = (await admin.from("sources").insert({ user_id: uid, subject_id: wh.id, filename: "Cell structure", kind: "text", bytes: 1, page_count: 1, status: "ready" }).select().single()).data;
  const card = (await admin.from("cards").insert({ user_id: uid, subject_id: wh.id, source_id: src.id, front: "What makes ATP?", back: "The nucleus" }).select().single()).data;
  const g = (await admin.from("groups").insert({ owner_id: uid, name: "AP Bio", code: "TESTAB" + String(Date.now() % 90 + 10).replace(/[01]/g, "2") }).select().single()).data;
  await admin.from("group_members").insert({ group_id: g.id, user_id: uid, display_name: "Test" });
  const set = (await admin.from("group_sets").insert({ group_id: g.id, source_id: src.id, shared_by: uid }).select().single()).data;
  const other = await otherStudent("gedit-b");
  try {
    await admin.from("group_members").insert({ group_id: g.id, user_id: other.uid, display_name: "Other" });
    // The member fixes the card.
    await other.p.goto(`${APP}/groups/${g.id}/sets/${set.id}`, { waitUntil: "networkidle" });
    await other.p.getByRole("button", { name: "Edit card: What makes ATP?" }).click();
    await other.p.getByLabel("Back").fill("The mitochondria");
    await other.p.getByRole("button", { name: "Save for the group" }).click();
    ok("the member's fix reaches the group's version", !!(await until(async () => (await admin.from("cards").select("back").eq("id", card.id).single()).data.back === "The mitochondria")));
    await other.p.getByText("Other changed a card").waitFor();
    ok("the change shows who made it", true);
    // The sharer undoes it, then the member redoes it, and the sharer edits again: the member's old change can't be undone now.
    await p.goto(`${APP}/groups/${g.id}/sets/${set.id}`, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "Undo" }).first().click();
    ok("undo restores it", !!(await until(async () => (await admin.from("cards").select("back").eq("id", card.id).single()).data.back === "The nucleus")));
    await other.p.reload({ waitUntil: "networkidle" });
    await other.p.getByRole("button", { name: "Edit card: What makes ATP?" }).click();
    await other.p.getByLabel("Back").fill("Mitochondria");
    await other.p.getByRole("button", { name: "Save for the group" }).click();
    await until(async () => (await admin.from("cards").select("back").eq("id", card.id).single()).data.back === "Mitochondria");
    await p.reload({ waitUntil: "networkidle" });
    await p.getByRole("button", { name: "Edit card: What makes ATP?" }).click();
    await p.getByLabel("Back").fill("Mitochondria, the powerhouse");
    await p.getByRole("button", { name: "Save for the group" }).click();
    await until(async () => (await admin.from("cards").select("back").eq("id", card.id).single()).data.back === "Mitochondria, the powerhouse");
    await other.p.reload({ waitUntil: "networkidle" });
    // The member's change is now the second in the list; undoing it would wipe the newer edit.
    await other.p.getByRole("button", { name: "Undo" }).nth(1).click();
    await other.p.getByText(/Someone changed that again since/).waitFor({ timeout: 10000 });
    ok("an undo that would erase a newer edit is refused", (await admin.from("cards").select("back").eq("id", card.id).single()).data.back === "Mitochondria, the powerhouse");
    // Lock: the member can't edit any more.
    await p.getByRole("button", { name: "Lock editing" }).click();
    await until(async () => (await admin.from("group_sets").select("locked").eq("id", set.id).single()).data.locked);
    await other.p.reload({ waitUntil: "networkidle" });
    ok("locked: no edit buttons for the member", (await other.p.getByRole("button", { name: /^Edit card/ }).count()) === 0);
    const token = await other.p.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.includes("auth-token")); return JSON.parse(localStorage.getItem(k)).access_token; });
    const direct = await fetch(`${FUNCTIONS}/share`, { method: "POST", headers: { Authorization: `Bearer ${token}`, apikey: "x", "Content-Type": "application/json" }, body: JSON.stringify({ action: "set_edit", set_id: set.id, item_type: "card", item_id: card.id, fields: { back: "Hacked" } }) });
    ok(`locked: a direct edit is refused too (${direct.status})`, direct.status === 403 && (await admin.from("cards").select("back").eq("id", card.id).single()).data.back !== "Hacked");
  } finally {
    await other.cleanup();
  }
});
