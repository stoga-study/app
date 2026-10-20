// The updates video's timeline: one source for the picture (composition.html) and the sound (audio.mjs).
// 60 seconds, loopable: it starts and ends on the same title frame.
export const FPS = 30;
export const DURATION = 60;
export const TITLE_END = 4;
export const CHAPTER = 5.4;
export const OUTRO_START = TITLE_END + 9 * CHAPTER; // 52.6
export const LOOP_FADE = 1.2; // the outro dissolves back into the title over the last 1.2 s

export const CHAPTERS = [
  { v: "1.1", label: "Study and review", title: "Study your way", points: ["Choose what gets made from each file", "Units, and notes you write yourself", "Reviews timed to how you remember"], screens: ["d-studyset", "p-studyset", "p-review", "p-note"] },
  { v: "1.2", label: "AI tutor", title: "A tutor that hints first", points: ["Answers cite the page they came from", "Explain any card or quiz mistake", "Simpler, or go deeper, on any answer"], screens: ["d-tutor", "p-tutor", "p-quiz"] },
  { v: "1.3", label: "Materials", title: "Bring every kind of note", points: ["PDFs, slides and photos of handouts", "Search across everything you've added", "Tags, archives and flashcard import"], screens: ["d-search", "p-upload", "p-search"] },
  { v: "1.4", label: "Planning", title: "Plans around real test dates", points: ["Your calendar, or import Schoology", "Readiness for every test", "A coach that plans with you"], screens: ["d-calendar", "p-calendar", "p-exam", "p-coach"] },
  { v: "1.5", label: "Progress", title: "Watch it add up", points: ["Study history and trends", "Goals, milestones, optional streaks", "Gentle reminders, never guilt"], screens: ["d-progress", "p-progress-history", "p-home"] },
  { v: "1.6", label: "Works like an app", title: "Works like an app", points: ["Flashcards and quizzes offline", "Install it on your phone", "Shortcuts and full accessibility"], screens: ["d-home", "p-home"] },
  { v: "1.7", label: "Study together", title: "Study together", points: ["Share a study set with a link", "Invite-only groups, first names only", "Reporting keeps groups kind"], screens: ["d-group", "p-group"] },
  { v: "1.8", label: "Private by design", title: "Yours, and private", points: ["Export or restore everything", "Privacy controls you can see", "A read-only page for a parent"], screens: ["p-data", "p-support", "d-plans"] },
  { v: "1.9", label: "Built with students", title: "Built with students", points: ["Feedback from any screen", "An ideas board you vote on", "Every update, out in the open"], screens: ["d-requests", "p-feedback", "p-ideas", "p-updates"] },
].map((c, i) => ({ ...c, start: TITLE_END + i * CHAPTER }));

/** When each bullet appears inside a chapter (seconds from its start). */
export const POINT_AT = [1.0, 1.6, 2.2];

/** Sound cues, in seconds: a chime on the title and the outro, a whoosh into each chapter, a soft tick on each point. */
export function cues() {
  const out = [{ t: 0.15, kind: "chime" }];
  for (const c of CHAPTERS) {
    out.push({ t: c.start - 0.25, kind: "whoosh" });
    for (const p of POINT_AT) out.push({ t: c.start + p, kind: "tick" });
  }
  out.push({ t: OUTRO_START - 0.25, kind: "whoosh" }, { t: OUTRO_START + 0.4, kind: "chime" });
  return out;
}
