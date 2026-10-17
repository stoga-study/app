// The read-only view a student shares with a parent, guardian, tutor or counselor: how studying is going,
// what's coming up, and how ready they are. Built only from counts, dates and readiness: never notes,
// chats, files, card or quiz content, or mistakes. Pure, so it is unit tested.
import { readiness, type Readiness } from "./readiness.ts";

export const RELATIONS = ["parent", "guardian", "tutor", "counselor", "other"] as const;
export type Relation = (typeof RELATIONS)[number];
export const UPCOMING_DAYS = 21;

export type SupportInput = {
  name: string;
  /** The student's local date (YYYY-MM-DD) and a function from a timestamp to their local date. */
  today: string;
  localDate: (iso: string) => string;
  subjects: { id: string; name: string }[];
  /** Studying, newest or oldest first: when, which class, how many items, how many right (null if not graded). */
  activity: { at: string; subject_id: string | null; n: number; correct: number | null }[];
  events: { id: string; subject_id: string | null; kind: string; title: string; due_on: string; done_at: string | null; unit_ids: string[] }[];
  cards: { subject_id: string; unit_id: string | null; state: number }[];
  quizzes: { subject_id: string; unit_id: string | null; count: number; last: { correct: number; total: number } | null }[];
  mistakes: { subject_id: string; unit_id: string | null }[];
};

export type SupportSummary = {
  name: string;
  today: string;
  /** The last 28 days, oldest first: items studied each day. */
  days: { date: string; n: number }[];
  daysStudied7: number;
  items7: number;
  classes: { name: string; items7: number; accuracy30: number | null }[];
  upcoming: { title: string; kind: string; className: string | null; due_on: string; done: boolean; readiness: Readiness | null }[];
};

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function buildSummary(x: SupportInput): SupportSummary {
  const start28 = addDays(x.today, -27), start7 = addDays(x.today, -6), start30 = addDays(x.today, -29);
  const perDay = new Map<string, number>();
  const perClass = new Map<string, { items7: number; correct: number; graded: number }>();
  for (const a of x.activity) {
    const day = x.localDate(a.at);
    if (day >= start28 && day <= x.today) perDay.set(day, (perDay.get(day) ?? 0) + a.n);
    if (!a.subject_id) continue;
    const c = perClass.get(a.subject_id) ?? { items7: 0, correct: 0, graded: 0 };
    if (day >= start7 && day <= x.today) c.items7 += a.n;
    if (day >= start30 && day <= x.today && a.correct != null) { c.correct += a.correct; c.graded += a.n; }
    perClass.set(a.subject_id, c);
  }
  const days = Array.from({ length: 28 }, (_, i) => { const date = addDays(start28, i); return { date, n: perDay.get(date) ?? 0 }; });
  const last7 = days.slice(-7);
  const className = new Map(x.subjects.map((s) => [s.id, s.name]));

  const end = addDays(x.today, UPCOMING_DAYS);
  const upcoming = x.events
    .filter((e) => e.due_on >= x.today && e.due_on <= end)
    .sort((a, b) => a.due_on.localeCompare(b.due_on))
    .slice(0, 20)
    .map((e) => {
      const exam = (e.kind === "test" || e.kind === "quiz") && !!e.subject_id;
      const covers = (s: string, u: string | null) => s === e.subject_id && (!e.unit_ids.length || (!!u && e.unit_ids.includes(u)));
      const qs = x.quizzes.filter((q) => q.count > 0 && covers(q.subject_id, q.unit_id));
      return {
        title: e.title, kind: e.kind, className: e.subject_id ? className.get(e.subject_id) ?? null : null, due_on: e.due_on, done: !!e.done_at,
        readiness: exam
          ? readiness({ cards: x.cards.filter((c) => covers(c.subject_id, c.unit_id)), quizzes: qs.filter((q) => q.last).map((q) => q.last!), quizzesAvailable: qs.length, mistakes: x.mistakes.filter((m) => covers(m.subject_id, m.unit_id)).length })
          : null,
      };
    });

  return {
    name: x.name,
    today: x.today,
    days,
    daysStudied7: last7.filter((d) => d.n > 0).length,
    items7: last7.reduce((n, d) => n + d.n, 0),
    classes: x.subjects.map((s) => {
      const c = perClass.get(s.id);
      return { name: s.name, items7: c?.items7 ?? 0, accuracy30: c && c.graded ? Math.round((100 * c.correct) / c.graded) : null };
    }),
    upcoming,
  };
}
