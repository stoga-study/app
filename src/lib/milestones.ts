// Quiet milestones: a few meaningful moments, each noticed once. No points, no leaderboards. Pure, tested.
import { addDays } from "./calendar";
import { weekOf } from "./goals";

export type MilestoneInput = {
  /** Every day with real studying. */
  studied: Set<string>;
  today: string;
  firstDay: number;
  cardsReviewed: number;
  cardsLearned: number;
  unitsMastered: number;
  practiceTests: number;
  bestPracticeTest: number | null;
  perfectQuizzes: number;
  ownNotes: number;
};
export type Milestone = { id: string; title: string; detail: string; reached: boolean; order: number };

/** The longest run of weeks in a row with any studying at all. */
export function longestWeekRun(studied: Set<string>, today: string, firstDay: number) {
  const weeks = new Set([...studied].map((d) => weekOf(d, firstDay).start));
  let best = 0, run = 0;
  const first = [...weeks].sort()[0];
  if (!first) return 0;
  for (let w = first; w <= weekOf(today, firstDay).start; w = addDays(w, 7)) {
    run = weeks.has(w) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export function milestones(i: MilestoneInput): Milestone[] {
  const days = i.studied.size;
  const weekRun = longestWeekRun(i.studied, i.today, i.firstDay);
  const list: Omit<Milestone, "order">[] = [
    { id: "first-review", title: "First cards reviewed", detail: "The start of everything.", reached: i.cardsReviewed > 0 },
    { id: "days-10", title: "10 study days", detail: "Ten days you showed up.", reached: days >= 10 },
    { id: "weeks-4", title: "4 weeks in a row", detail: "A month of studying every week.", reached: weekRun >= 4 },
    { id: "learned-100", title: "100 cards learned", detail: "A hundred cards in long-term memory.", reached: i.cardsLearned >= 100 },
    { id: "first-unit", title: "First unit mastered", detail: "A whole unit, solid.", reached: i.unitsMastered >= 1 },
    { id: "first-test", title: "First practice test", detail: "Practised under real conditions.", reached: i.practiceTests >= 1 },
    { id: "test-90", title: "90% on a practice test", detail: "Ready for the real thing.", reached: (i.bestPracticeTest ?? 0) >= 90 },
    { id: "perfect-quiz", title: "A perfect quiz", detail: "Every question right.", reached: i.perfectQuizzes >= 1 },
    { id: "notes-5", title: "5 notes of your own", detail: "Writing it down yourself sticks.", reached: i.ownNotes >= 5 },
    { id: "days-50", title: "50 study days", detail: "Fifty days of showing up.", reached: days >= 50 },
    { id: "learned-500", title: "500 cards learned", detail: "Five hundred cards you know.", reached: i.cardsLearned >= 500 },
    { id: "weeks-12", title: "12 weeks in a row", detail: "A whole term of steady studying.", reached: weekRun >= 12 },
    { id: "days-100", title: "100 study days", detail: "A hundred days. That's real.", reached: days >= 100 },
    { id: "learned-1000", title: "1,000 cards learned", detail: "A thousand cards in long-term memory.", reached: i.cardsLearned >= 1000 },
  ];
  return list.map((m, order) => ({ ...m, order }));
}

/** Milestones reached but not yet noticed: these get celebrated (quietly, one at a time). */
export const newlyReached = (all: Milestone[], seen: Record<string, string>) => all.filter((m) => m.reached && !seen[m.id]);
