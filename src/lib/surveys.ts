// Optional surveys: 1 to 3 questions, shown as a small card on Home at the right moment, at most one at a time.
// Pure, so when a survey is due is unit tested.

export type Question =
  | { id: string; kind: "scale"; text: string; low: string; high: string }
  | { id: string; kind: "choice"; text: string; options: string[] }
  | { id: string; kind: "text"; text: string; optional: true };
export type Survey = { id: string; title: string; questions: Question[] };

export const SURVEYS: Record<"week-one" | "first-test", (ctx: { testTitle?: string }) => Survey> = {
  "week-one": () => ({
    id: "week-one",
    title: "Got 30 seconds? Three quick questions about your first week.",
    questions: [
      { id: "useful", kind: "scale", text: "How useful has Stoga.study been so far?", low: "Not yet", high: "Very" },
      { id: "most", kind: "choice", text: "What do you use most?", options: ["Flashcards", "Practice quizzes", "The tutor", "The coach", "The calendar and plan", "My own notes"] },
      { id: "change", kind: "text", text: "One thing we should fix or add?", optional: true },
    ],
  }),
  "first-test": ({ testTitle }) => ({
    id: "first-test",
    title: `How did ${testTitle ?? "your test"} go? Two quick questions.`,
    questions: [
      { id: "ready", kind: "scale", text: "How ready did you feel going in?", low: "Not at all", high: "Very ready" },
      { id: "helped", kind: "choice", text: "Did Stoga.study help you prepare?", options: ["A lot", "A little", "Not really", "I didn't use it for this"] },
    ],
  }),
};

/**
 * The survey to show now, if any: after a test on the calendar has passed (in the last 3 days), ask about it once;
 * otherwise after a week in the app. Never one the student already answered or put off.
 */
export function dueSurvey(o: { today: string; joinedAt: string; pastTests: { title: string; due_on: string }[]; answered: Set<string> }): Survey | null {
  const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400_000);
  if (!o.answered.has("first-test")) {
    const t = o.pastTests.filter((e) => { const d = daysBetween(e.due_on, o.today); return d >= 1 && d <= 3; }).sort((a, b) => b.due_on.localeCompare(a.due_on))[0];
    if (t) return SURVEYS["first-test"]({ testTitle: t.title });
  }
  if (!o.answered.has("week-one") && daysBetween(o.joinedAt.slice(0, 10), o.today) >= 7) return SURVEYS["week-one"]({});
  return null;
}
