// v1.7.0: one student shares a study set; another adds a private copy. Turning the link off stops it.
import { admin, APP, ok, otherStudent, run, until } from "./harness.mjs";
await run("share", async ({ p, uid, wh }) => {
  const src = (await admin.from("sources").insert({ user_id: uid, subject_id: wh.id, filename: "Cell structure", kind: "text", bytes: 1, page_count: 1, status: "ready" }).select().single()).data;
  await admin.from("source_pages").insert({ user_id: uid, source_id: src.id, page_no: 1, text: "Cells make ATP." });
  await admin.from("notes_sections").insert({ user_id: uid, source_id: src.id, position: 0, title: "Cells", body_md: "Cells.", pages: [1] });
  await admin.from("cards").insert([{ user_id: uid, subject_id: wh.id, source_id: src.id, front: "What makes ATP?", back: "Mitochondria", state: 2, reps: 5, hidden: false }, { user_id: uid, subject_id: wh.id, source_id: src.id, front: "Reported card", back: "x", state: 0, reps: 0, hidden: true }]);
  const qz = (await admin.from("quizzes").insert({ user_id: uid, source_id: src.id, subject_id: wh.id, title: "Cells quiz" }).select().single()).data;
  await admin.from("quiz_questions").insert({ user_id: uid, quiz_id: qz.id, position: 0, prompt: "Q?", options: ["a", "b", "c", "d"], answer_index: 0, explanation: "x", pages: [1] });
  await admin.from("student_notes").insert({ id: crypto.randomUUID(), user_id: uid, subject_id: wh.id, source_id: src.id, title: "My private note", body: "secret" });

  await p.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: APP });
  await p.goto(`${APP}/sources/${src.id}`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Share", exact: true }).click();
  await p.getByRole("button", { name: "Make a link" }).click();
  const link = await until(async () => (await admin.from("share_links").select("id, token").eq("user_id", uid).maybeSingle()).data);
  ok("link made", !!link);
  await p.getByText("Your links").waitFor();

  const other = await otherStudent("share-b");
  try {
    await other.p.goto(`${APP}/s/${link.token}`, { waitUntil: "networkidle" });
    await other.p.getByText("Test shared a study set").waitFor({ timeout: 15000 });
    ok("preview shows the sharer's first name and what's inside", await other.p.getByText("Cell structure").isVisible() && await other.p.getByText("flashcards").isVisible());
    await other.p.getByRole("button", { name: "Add to my class" }).click();
    await other.p.waitForURL(/\/sources\//);
    const copy = (await admin.from("sources").select("id, subject_id, copied_from").eq("user_id", other.uid).single()).data;
    const cards = (await admin.from("cards").select("front, state, reps").eq("source_id", copy.id)).data;
    const pages = (await admin.from("source_pages").select("page_no").eq("source_id", copy.id)).data;
    const quiz = (await admin.from("quizzes").select("id, quiz_questions!quiz_questions_quiz_id_fkey(count)").eq("source_id", copy.id)).data;
    const notes = (await admin.from("student_notes").select("id").eq("user_id", other.uid)).data;
    ok("copy is in their class, linked to the share", copy.subject_id === other.subject.id && copy.copied_from === link.id);
    ok("cards copied fresh, reported card left out", cards.length === 1 && cards[0].state === 0 && cards[0].reps === 0);
    ok("pages and quiz copied", pages.length === 1 && quiz.length === 1 && quiz[0].quiz_questions[0].count === 1);
    ok("the sharer's own notes are never copied", notes.length === 0);
    // Turn the link off: it stops working.
    await p.getByRole("button", { name: "Turn off" }).click();
    await until(async () => (await admin.from("share_links").select("revoked_at").eq("id", link.id).single()).data.revoked_at);
    await other.p.goto(`${APP}/s/${link.token}`, { waitUntil: "networkidle" });
    ok("a turned-off link doesn't work", await other.p.getByText("This link doesn't work anymore").isVisible().catch(() => false) || !!(await other.p.getByText("This link doesn't work anymore").waitFor({ timeout: 10000 }).then(() => true).catch(() => false)));
  } finally {
    await other.cleanup();
  }
});
