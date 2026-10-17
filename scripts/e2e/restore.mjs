// v1.8.2: a backup restores into a new account (merging a same-name class) and into the same account
// (only what was deleted comes back), and restoring twice adds nothing.
import path from "node:path";
import { admin, APP, ok, otherStudent, run, SHOTS, until, waitForDeploy } from "./harness.mjs";

const count = async (table, uid) => (await admin.from(table).select("*", { count: "exact", head: true }).eq("user_id", uid)).count;

async function download(p, withFiles) {
  await p.goto(`${APP}/settings#data`, { waitUntil: "networkidle" });
  const box = p.locator("#data");
  if (withFiles) await box.getByLabel("Include my original files (bigger download)").check();
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }), box.getByRole("button", { name: "Download my data" }).click()]);
  const file = path.join(SHOTS, `${Date.now()}-${dl.suggestedFilename()}`);
  await dl.saveAs(file);
  return file;
}

async function restore(p, file) {
  await p.goto(`${APP}/settings#data`, { waitUntil: "networkidle" });
  await p.reload({ waitUntil: "networkidle" }); // a fresh page, so an earlier message isn't read as this one's
  const box = p.locator("#data");
  await box.getByLabel("Choose a backup file").setInputFiles(file);
  await box.getByRole("button", { name: "Restore", exact: true }).waitFor();
  const summary = await box.locator(".card").innerText();
  await box.getByRole("button", { name: "Restore", exact: true }).click();
  const toast = p.locator("[data-sonner-toast]").filter({ hasText: /Restored|already here|stopped/ });
  await toast.first().waitFor({ timeout: 90000 });
  const text = await toast.first().innerText();
  console.log("   toast:", text.replace(/\s+/g, " "));
  return { summary, toast: text };
}

await waitForDeploy("Choose a backup file");
await run("restore", async ({ p, uid, wh }) => {
  const src = (await admin.from("sources").insert({ user_id: uid, subject_id: wh.id, filename: "Cell structure", kind: "text", bytes: 1, page_count: 1, status: "ready" }).select().single()).data;
  const storage_path = `${uid}/${src.id}/cells.txt`;
  await admin.storage.from("sources").upload(storage_path, new Blob(["Cells make ATP."], { type: "text/plain" }), { contentType: "text/plain" });
  await admin.from("sources").update({ storage_path, original_filename: "cells.txt" }).eq("id", src.id);
  await admin.from("source_pages").insert({ user_id: uid, source_id: src.id, page_no: 1, text: "Cells make ATP." });
  await admin.from("notes_sections").insert({ user_id: uid, source_id: src.id, position: 0, title: "Mitochondria", body_md: "They make ATP.", pages: [1] });
  await admin.from("cards").insert([
    { user_id: uid, subject_id: wh.id, source_id: src.id, front: "What makes ATP?", back: "Mitochondria", state: 2, reps: 5, lapses: 1, stability: 12.5, difficulty: 4.2, due: "2026-11-01T00:00:00Z", hidden: false },
    { user_id: uid, subject_id: wh.id, source_id: null, front: "Typed card", back: "Mine", state: 0, reps: 0, lapses: 0, stability: 0, difficulty: 0, due: "2026-10-16T00:00:00Z", hidden: false },
  ]);
  const qz = (await admin.from("quizzes").insert({ user_id: uid, source_id: src.id, subject_id: wh.id, title: "Cells quiz" }).select().single()).data;
  await admin.from("quiz_questions").insert({ user_id: uid, quiz_id: qz.id, position: 0, prompt: "What makes ATP?", options: ["Mitochondria", "Nucleus", "Ribosome", "Wall"], answer_index: 0, explanation: "x", pages: [1] });
  const unit = (await admin.from("units").insert({ user_id: uid, subject_id: wh.id, number: "4", title: "Cells" }).select().single()).data;
  await admin.from("sources").update({ unit_id: unit.id }).eq("id", src.id);
  const note = crypto.randomUUID();
  await admin.from("student_notes").insert({ id: note, user_id: uid, subject_id: wh.id, unit_id: unit.id, title: "My review", body: "Remember the Krebs cycle." });
  const ev = (await admin.from("events").insert({ user_id: uid, subject_id: wh.id, kind: "test", title: "Unit 4 test", due_on: "2026-11-02" }).select().single()).data;
  await admin.from("event_units").insert({ user_id: uid, event_id: ev.id, unit_id: unit.id });
  await admin.from("goals").insert({ user_id: uid, kind: "cards", target: 50 });

  const zip = await download(p, true);
  ok("backup downloaded", !!zip);

  // 1. Into a new account that already has a "Biology" class.
  const other = await otherStudent("restore-b", { width: 1280, height: 900 });
  try {
    const r = await restore(other.p, zip);
    ok("summary names what's inside", /1 class, 1 file \(1 with the original\), 2 flashcards, 1 note and 1 calendar item/.test(r.summary));
    ok("restored", /^Restored \d+ items$/.test(r.toast.trim()));
    const subs = (await admin.from("subjects").select("id, name").eq("user_id", other.uid)).data;
    ok("same-name class merged, not doubled", subs.length === 1 && subs[0].id === other.subject.id);
    const s2 = (await admin.from("sources").select("id, subject_id, unit_id, storage_path, status, counted").eq("user_id", other.uid)).data;
    ok("file restored into their class, with a new id", s2.length === 1 && s2[0].id !== src.id && s2[0].subject_id === other.subject.id && s2[0].status === "ready" && s2[0].counted === false);
    const cards = (await admin.from("cards").select("front, reps, state, stability, source_id").eq("user_id", other.uid).order("front")).data;
    ok("cards back, with review progress", cards.length === 2 && cards[0].front === "Typed card" && cards[0].source_id === null && cards[1].reps === 5 && cards[1].state === 2 && cards[1].stability === 12.5 && cards[1].source_id === s2[0].id);
    ok("pages, notes and quiz", (await count("source_pages", other.uid)) === 1 && (await count("notes_sections", other.uid)) === 1 && (await count("quiz_questions", other.uid)) === 1);
    const u2 = (await admin.from("units").select("id, number").eq("user_id", other.uid)).data;
    ok("unit restored and linked", u2.length === 1 && u2[0].number === "4" && s2[0].unit_id === u2[0].id);
    const n2 = (await admin.from("student_notes").select("title, unit_id").eq("user_id", other.uid)).data;
    ok("own note restored", n2.length === 1 && n2[0].title === "My review" && n2[0].unit_id === u2[0].id);
    const e2 = (await admin.from("events").select("id, title").eq("user_id", other.uid)).data;
    ok("calendar restored, with its unit", e2.length === 1 && (await count("event_units", other.uid)) === 1);
    ok("goal restored", (await count("goals", other.uid)) === 1);
    ok("original file restored to their own folder", s2[0].storage_path?.startsWith(`${other.uid}/${s2[0].id}/`) && (await (await admin.storage.from("sources").download(s2[0].storage_path)).data?.text()) === "Cells make ATP.");
    ok("the first student's data is untouched", (await count("cards", uid)) === 2 && (await count("sources", uid)) === 1);

    // Restoring the same backup again adds nothing.
    const again = await restore(other.p, zip);
    ok("restoring twice adds nothing", (await count("cards", other.uid)) === 2 && (await count("sources", other.uid)) === 1 && (await count("student_notes", other.uid)) === 1 && (await count("events", other.uid)) === 1);
    ok("and says so", /already here|Restored 0 items/.test(again.toast));
  } finally {
    await other.cleanup();
  }

  // 2. Into the same account, after deleting a note and a calendar item: just those come back, same ids.
  await admin.from("student_notes").delete().eq("id", note);
  await admin.from("events").delete().eq("id", ev.id);
  const r = await restore(p, zip);
  ok("same account: restored", /Restored/.test(r.toast));
  ok("deleted note and calendar item are back, with their ids", !!(await until(async () => (await admin.from("student_notes").select("id").eq("id", note).maybeSingle()).data)) && !!(await admin.from("events").select("id").eq("id", ev.id).maybeSingle()).data);
  ok("nothing doubled", (await count("cards", uid)) === 2 && (await count("sources", uid)) === 1 && (await count("subjects", uid)) === 1 && (await count("goals", uid)) === 1 && (await count("units", uid)) === 1);
  await p.goto(`${APP}/calendar`, { waitUntil: "networkidle" });
  ok("the app shows it right away", await p.getByText("Unit 4 test").first().isVisible().catch(() => false) || !!(await p.getByText("Unit 4 test").first().waitFor({ timeout: 8000 }).then(() => true).catch(() => false)));
});
