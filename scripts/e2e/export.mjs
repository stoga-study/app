// v1.8.1: Download your data makes one zip of everything the student has, and nothing of anyone else's.
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { admin, APP, ok, otherStudent, run, SHOTS, waitForDeploy } from "./harness.mjs";

await waitForDeploy("stoga-study-export");
await run("export", async ({ p, uid, wh }) => {
  const src = (await admin.from("sources").insert({ user_id: uid, subject_id: wh.id, filename: "Cell structure", kind: "text", bytes: 1, page_count: 1, status: "ready" }).select().single()).data;
  const storage_path = `${uid}/${src.id}/cells.txt`;
  await admin.storage.from("sources").upload(storage_path, new Blob(["Cells make ATP."], { type: "text/plain" }), { contentType: "text/plain" });
  await admin.from("sources").update({ storage_path, original_filename: "cells.txt" }).eq("id", src.id);
  await admin.from("source_pages").insert({ user_id: uid, source_id: src.id, page_no: 1, text: "Cells make ATP." });
  await admin.from("notes_sections").insert({ user_id: uid, source_id: src.id, position: 0, title: "Mitochondria", body_md: "They make ATP.", pages: [1] });
  await admin.from("cards").insert([
    { user_id: uid, subject_id: wh.id, source_id: src.id, front: "What makes ATP, \"mostly\"?", back: "Mitochondria", state: 0, reps: 0, hidden: false },
    { user_id: uid, subject_id: wh.id, source_id: src.id, front: "Reported card", back: "x", state: 0, reps: 0, hidden: true },
  ]);
  const qz = (await admin.from("quizzes").insert({ user_id: uid, source_id: src.id, subject_id: wh.id, title: "Cells quiz" }).select().single()).data;
  await admin.from("quiz_questions").insert({ user_id: uid, quiz_id: qz.id, position: 0, prompt: "What makes ATP?", options: ["Mitochondria", "Nucleus", "Ribosome", "Wall"], answer_index: 0, explanation: "x", pages: [1] });
  await admin.from("student_notes").insert({ id: crypto.randomUUID(), user_id: uid, subject_id: wh.id, title: "My review", body: "Remember the Krebs cycle." });
  await admin.from("events").insert({ user_id: uid, subject_id: wh.id, kind: "test", title: "Unit 4 test; cells", due_on: "2026-11-02" });

  const other = await otherStudent("export-b");
  try {
    await admin.from("student_notes").insert({ id: crypto.randomUUID(), user_id: other.uid, subject_id: other.subject.id, title: "Someone else's note", body: "not yours" });
    await p.goto(`${APP}/settings#data`, { waitUntil: "networkidle" });
    const box = p.locator("#data");
    await box.getByLabel("Include my original files (bigger download)").check();
    const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }), box.getByRole("button", { name: "Download my data" }).click()]);
    await box.screenshot({ path: path.join(SHOTS, "export-section.png") });
    ok("named by date", /^stoga-study-\d{4}-\d{2}-\d{2}\.zip$/.test(dl.suggestedFilename()));
    const file = path.join(SHOTS, dl.suggestedFilename());
    await dl.saveAs(file);
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    const names = Object.keys(zip.files);
    const read = (n) => zip.file(n)?.async("string");
    const set = "classes/Biology/study-sets/Cell structure";
    ok("own note as Markdown", (await read("classes/Biology/my-notes/My review.md"))?.includes("Krebs cycle"));
    ok("study set notes", (await read(`${set}/notes.md`))?.includes("## Mitochondria"));
    ok("page text", (await read(`${set}/text.md`))?.includes("Cells make ATP."));
    const quizzes = JSON.parse((await read(`${set}/quizzes.json`)) ?? "[]");
    ok("quiz with its answer", quizzes[0]?.questions[0]?.answer === "Mitochondria");
    const csv = (await read("classes/Biology/flashcards.csv")) ?? "";
    ok("flashcards CSV, quotes escaped, reported card left out", csv.includes('"What makes ATP, ""mostly""?",Mitochondria') && !csv.includes("Reported card"));
    ok("Anki file", (await read("classes/Biology/flashcards-anki.txt"))?.startsWith("#separator:tab"));
    const ics = (await read("calendar.ics")) ?? "";
    ok("calendar file", ics.startsWith("BEGIN:VCALENDAR") && ics.includes("SUMMARY:Unit 4 test\\; cells") && ics.includes("DTSTART;VALUE=DATE:20261102"));
    ok("original file included", (await read("files/cells.txt")) === "Cells make ATP.");
    const data = JSON.parse((await read("data.json")) ?? "{}");
    ok("data.json is complete", data.format === "stoga-study-export" && data.cards.length === 2 && data.sources.length === 1 && data.events.length === 1);
    ok("nothing of anyone else's", !JSON.stringify(data).includes("Someone else's note") && !names.some((n) => n.includes("Someone else")));
    ok("README", names.includes("README.txt"));
  } finally {
    await other.cleanup();
  }
});
