import { addDays, daysBetween } from "./calendar";

/**
 * The study planner: spreads the work for each upcoming test or quiz over the days left, within a
 * daily minutes budget. Pure and rules-only (no AI). Today's tasks tick off from what the student
 * actually did; later days are a preview that recalculates every day.
 */

export type TaskKind = "review" | "mistakes" | "quiz" | "guide";
export type PlanTask = { key: string; kind: TaskKind; examId: string; examTitle: string; title: string; minutes: number; href: string; done: boolean; auto: boolean };
export type PlanDay = { day: string; tasks: PlanTask[]; minutes: number; intense: boolean };

/** Everything the planner needs to know about one test: what it covers and where the student is. */
export type ExamScope = {
  id: string;
  title: string;
  due_on: string;
  /** Cards in the test's units (or whole class) that are due now, and how many of those are new. */
  dueNow: number;
  fresh: number;
  /** Cards in scope reviewed today. */
  reviewedToday: number;
  reviewHref: string;
  /** Open quiz mistakes in scope. */
  mistakes: number;
  /** Practice quizzes in scope, best first; the key is what the quiz page marks done. */
  quizzes: { key: string; href: string; label: string }[];
  /** Files in scope with a study guide. */
  guides: { key: string; href: string; label: string; minutes: number }[];
};

/** Tests further off than this are not planned yet. */
export const HORIZON = 14;
const PRIORITY: Record<TaskKind, number> = { review: 0, mistakes: 1, quiz: 2, guide: 3 };
export const cardMinutes = (n: number) => Math.max(2, Math.ceil((n * 12) / 60));
const QUIZ_MINUTES = 8;
const mistakeMinutes = (n: number) => Math.min(10, 2 + n);

/** Cards to review today: everything already in rotation, plus an even share of the new ones. */
export function reviewToday(s: Pick<ExamScope, "dueNow" | "fresh" | "reviewedToday">, daysLeft: number) {
  const inRotation = Math.max(0, s.dueNow - s.fresh);
  const share = Math.max(0, Math.ceil((s.fresh + s.reviewedToday) / Math.max(1, daysLeft)) - s.reviewedToday);
  return Math.min(s.dueNow, inRotation + share);
}

function tasksFor(s: ExamScope, day: string, today: string, done: Set<string>): PlanTask[] {
  const dd = daysBetween(day, s.due_on);
  if (dd < 1) return [];
  const isToday = day === today;
  const intense = dd <= 2;
  const out: PlanTask[] = [];
  const base = { examId: s.id, examTitle: s.title };

  // Review: every day, while there is something to review.
  if (isToday) {
    const n = reviewToday(s, dd);
    const key = `review:${s.id}`;
    if (n > 0 || s.reviewedToday > 0) {
      const finished = n === 0 || done.has(key);
      out.push({ ...base, key, kind: "review", title: finished ? `Reviewed ${s.reviewedToday} card${s.reviewedToday === 1 ? "" : "s"}` : `Review ${n} card${n === 1 ? "" : "s"}`, minutes: cardMinutes(finished ? s.reviewedToday : n), href: `${s.reviewHref}${n <= 10 ? "&size=10" : n <= 20 ? "&size=20" : ""}`, done: finished, auto: true });
    }
  } else {
    // A preview: the new cards still to learn, shared over the days left from then.
    const daysFromToday = daysBetween(today, day);
    const freshLeft = Math.max(0, s.fresh - Math.ceil(s.fresh / Math.max(1, dd + daysFromToday)) * daysFromToday);
    const n = Math.ceil(freshLeft / dd);
    if (n > 0 || intense) out.push({ ...base, key: `review:${s.id}`, kind: "review", title: n > 0 ? `Review about ${n} cards` : "Review your due cards", minutes: cardMinutes(Math.max(n, 10)), href: s.reviewHref, done: false, auto: true });
  }

  // Mistakes: every day near the test, every other day before that.
  if (s.mistakes > 0 && (intense || dd % 2 === 0)) {
    out.push({ ...base, key: "mistakes", kind: "mistakes", title: `Go over ${s.mistakes} quiz mistake${s.mistakes === 1 ? "" : "s"}`, minutes: mistakeMinutes(s.mistakes), href: "/mistakes", done: isToday && done.has("mistakes"), auto: false });
  }

  // A practice quiz: the two days before, and every third day before that, rotating through them.
  if (s.quizzes.length && (intense || dd % 3 === 0)) {
    const q = s.quizzes[dd % s.quizzes.length];
    out.push({ ...base, key: q.key, kind: "quiz", title: `Practice quiz: ${q.label}`, minutes: QUIZ_MINUTES, href: q.href, done: isToday && done.has(q.key), auto: false });
  }

  // A study guide to read, one file a day, while there is time to learn rather than cram.
  if (s.guides.length && !intense) {
    const g = s.guides[dd % s.guides.length];
    out.push({ ...base, key: g.key, kind: "guide", title: `Read the study guide: ${g.label}`, minutes: Math.min(20, Math.max(5, g.minutes)), href: g.href, done: isToday && done.has(g.key), auto: false });
  }
  return out;
}

/**
 * The plan for `days` days from `today`. Each day keeps its most important tasks (nearest test
 * first, then review, mistakes, quiz, guide) up to the budget; the two days before a test get half
 * as much again. A day always keeps its first task, and finished tasks always stay (ticked).
 */
export function buildPlan(opts: { today: string; exams: ExamScope[]; budget: number; done: Set<string>; days?: number }): PlanDay[] {
  const { today, budget, done } = opts;
  const exams = opts.exams.filter((e) => {
    const n = daysBetween(today, e.due_on);
    return n >= 1 && n <= HORIZON;
  });
  const out: PlanDay[] = [];
  for (let i = 0; i < (opts.days ?? 7); i++) {
    const day = addDays(today, i);
    const all = exams
      .map((e) => ({ dd: daysBetween(day, e.due_on), tasks: tasksFor(e, day, today, done) }))
      .flatMap(({ dd, tasks }) => tasks.map((t) => ({ t, dd })))
      .sort((a, b) => a.dd - b.dd || PRIORITY[a.t.kind] - PRIORITY[b.t.kind]);
    const intense = all.some((x) => x.dd <= 2);
    const limit = intense ? Math.round(budget * 1.5) : budget;
    const seen = new Set<string>();
    const tasks: PlanTask[] = [];
    let minutes = 0;
    for (const { t } of all) {
      if (seen.has(t.key)) continue;
      if (tasks.length && !t.done && minutes + t.minutes > limit) continue;
      seen.add(t.key);
      tasks.push(t);
      minutes += t.minutes;
    }
    out.push({ day, tasks, minutes, intense });
  }
  return out;
}
