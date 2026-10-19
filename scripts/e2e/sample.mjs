// An example student with realistic classes, for screenshots: AP Statistics (unit 4, 30 cards due, a quiz,
// a midterm on the coming Monday) and Honors Anatomy (homework, a quiz, 8 cards due).
import { admin } from "./harness.mjs";

const STATS = [
  ["What does the central limit theorem say?", "For large n, the sampling distribution of the mean is approximately normal."],
  ["Standard error of the mean", "σ divided by the square root of n."],
  ["When is n large enough for the CLT?", "Usually n ≥ 30, or sooner if the population is close to normal."],
  ["What is a sampling distribution?", "The distribution of a statistic over all possible samples of the same size."],
  ["Is the sample mean unbiased?", "Yes. Its mean equals the population mean μ."],
  ["10% condition", "The sample is at most 10% of the population, so draws are close to independent."],
];

export async function seedSample(uid, wh) {
  await admin.from("profiles").update({ first_name: "Ava" }).eq("user_id", uid);
  await admin.from("subjects").update({ name: "AP Statistics" }).eq("id", wh.id);
  const anat = (await admin.from("subjects").insert({ user_id: uid, name: "Honors Anatomy", area: "Science", school_year: "2026-27", color_index: 2 }).select().single()).data;
  const unit = (await admin.from("units").insert({ user_id: uid, subject_id: wh.id, number: "4", title: "Sampling distributions" }).select().single()).data;
  await admin.from("subjects").update({ current_unit_id: unit.id }).eq("id", wh.id);
  const src = (await admin.from("sources").insert({ user_id: uid, subject_id: wh.id, unit_id: unit.id, filename: "Sampling distributions notes", kind: "pdf", bytes: 1, page_count: 6, status: "ready" }).select().single()).data;
  const src2 = (await admin.from("sources").insert({ user_id: uid, subject_id: wh.id, unit_id: unit.id, filename: "Chapter 7 worksheet", kind: "pdf", bytes: 1, page_count: 2, status: "ready" }).select().single()).data;
  await admin.from("source_pages").insert([1, 2].map((n) => ({ user_id: uid, source_id: src.id, page_no: n, text: "Sampling distributions." })));
  await admin.from("notes_sections").insert({ user_id: uid, source_id: src.id, position: 0, title: "The central limit theorem", body_md: "For large samples the sample mean is approximately normal.", pages: [1] });
  const now = new Date(Date.now() - 3600e3).toISOString();
  const cards = [];
  for (let i = 0; i < 38; i++) {
    const [front, back] = STATS[i % STATS.length];
    cards.push({ user_id: uid, subject_id: i < 30 ? wh.id : anat.id, source_id: i < 30 ? src.id : null, front: i < STATS.length ? front : `${front} (${i})`, back, state: 2, reps: 3, lapses: 0, stability: 6, difficulty: 5, due: now, hidden: false });
  }
  await admin.from("cards").insert(cards);
  const qz = (await admin.from("quizzes").insert({ user_id: uid, source_id: src.id, subject_id: wh.id, title: "Sampling distributions quiz" }).select().single()).data;
  await admin.from("quiz_questions").insert([
    { user_id: uid, quiz_id: qz.id, position: 0, prompt: "A population has σ = 12. What is the standard error of the mean for samples of n = 36?", options: ["12", "6", "2", "0.33"], answer_index: 2, explanation: "Divide σ by the square root of n: 12 ÷ 6 = 2.", topic: "Standard error", pages: [2] },
    { user_id: uid, quiz_id: qz.id, position: 1, prompt: "Which condition makes sample draws close to independent?", options: ["Large counts", "10% condition", "Random sampling", "Normal population"], answer_index: 1, explanation: "Sampling at most 10% of the population.", topic: "Conditions", pages: [3] },
  ]);
  const ev = (await admin.from("events").insert([
    { user_id: uid, subject_id: wh.id, kind: "test", title: "AP Statistics midterm", due_on: "2026-10-19" },
    { user_id: uid, subject_id: anat.id, kind: "homework", title: "Read chapter 7", due_on: "2026-10-17" },
    { user_id: uid, subject_id: anat.id, kind: "quiz", title: "Bones of the skull quiz", due_on: "2026-10-23" },
  ]).select()).data;
  await admin.from("event_units").insert({ user_id: uid, event_id: ev[0].id, unit_id: unit.id });

  return { wh, anat, unit, src, qz, ev };
}
