// Weekly goals and the weekly recap. Rules only, pure, unit tested.
import { addDays, daysBetween, fromIso } from "./calendar";
import type { HistoryRow } from "./history";

export type GoalKind = "days" | "cards" | "questions" | "minutes" | "custom";
export type Goal = { id: string; kind: GoalKind; target: number; label: string | null; subject_id: string | null };
export type Session = { started_at: string; ended_at: string; subject_ids: string[]; startDay: string };

export const GOAL_KINDS: { kind: GoalKind; label: string; unit: (n: number) => string; presets: number[] }[] = [
  { kind: "days", label: "Study days", unit: (n) => `day${n === 1 ? "" : "s"}`, presets: [3, 4, 5, 6] },
  { kind: "cards", label: "Cards reviewed", unit: (n) => `card${n === 1 ? "" : "s"}`, presets: [50, 100, 200, 300] },
  { kind: "questions", label: "Quiz questions", unit: (n) => `question${n === 1 ? "" : "s"}`, presets: [10, 20, 40, 60] },
  { kind: "minutes", label: "Study minutes", unit: () => "min", presets: [60, 120, 180, 300] },
  { kind: "custom", label: "Your own", unit: (n) => `time${n === 1 ? "" : "s"}`, presets: [1, 2, 3, 5] },
];
export const goalMeta = (k: GoalKind) => GOAL_KINDS.find((g) => g.kind === k)!;

/** The week containing `day`, from the student's first day of the week (0 = Sunday). */
export function weekOf(day: string, firstDay: number) {
  const start = addDays(day, -((fromIso(day).getDay() - firstDay + 7) % 7));
  return { start, end: addDays(start, 6) };
}
const inWeek = (day: string, w: { start: string; end: string }) => day >= w.start && day <= w.end;

/** Minutes from sessions: their length, and at least two minutes each (one card still took a moment). */
export const sessionMinutes = (s: Pick<Session, "started_at" | "ended_at">) => Math.max(2, Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 60000) + 1);

/** How far a goal got in a week. Class goals count only that class. */
export function goalProgress(g: Goal, w: { start: string; end: string }, rows: HistoryRow[], sessions: Session[], tickDays: string[]) {
  const mine = rows.filter((r) => inWeek(r.day, w) && (!g.subject_id || r.subject_id === g.subject_id));
  let value = 0;
  if (g.kind === "days") value = new Set(mine.filter((r) => r.n > 0).map((r) => r.day)).size;
  if (g.kind === "cards") value = mine.filter((r) => r.kind === "review").reduce((n, r) => n + r.n, 0);
  if (g.kind === "questions") value = mine.filter((r) => r.kind === "quiz" || r.kind === "practice_test").reduce((n, r) => n + r.n, 0);
  if (g.kind === "minutes") value = sessions.filter((s) => inWeek(s.startDay, w) && (!g.subject_id || s.subject_ids.includes(g.subject_id))).reduce((n, s) => n + sessionMinutes(s), 0);
  if (g.kind === "custom") value = tickDays.filter((d) => inWeek(d, w)).length;
  return { value, target: g.target, done: value >= g.target, pct: Math.min(1, value / g.target) };
}

/** "3 of 5 days", "120 of 200 cards". */
export function goalText(g: Goal, value: number) {
  const m = goalMeta(g.kind);
  return g.kind === "minutes" ? `${value} of ${g.target} min` : `${value} of ${g.target} ${m.unit(g.target)}`;
}

/** A goal's name: "Study 5 days", "Review 100 Biology cards", "Read a chapter 3 times". */
export function goalName(g: Goal, className?: string | null) {
  const cls = className ? `${className} ` : "";
  switch (g.kind) {
    case "days": return `Study ${g.target} day${g.target === 1 ? "" : "s"}${className ? ` of ${className}` : ""}`;
    case "cards": return `Review ${g.target} ${cls}cards`;
    case "questions": return `Answer ${g.target} ${cls}quiz questions`;
    case "minutes": return `Study ${g.target} minutes${className ? ` of ${className}` : ""}`;
    case "custom": return g.target === 1 ? g.label ?? "My goal" : `${g.label ?? "My goal"} · ${g.target}×`;
  }
}

export type Recap = {
  week: { start: string; end: string };
  activity: number;
  days: number;
  cards: number;
  questions: number;
  recallPct: number | null;
  quizPct: number | null;
  bestDay: { day: string; activity: number } | null;
  goalsMet: number;
  goals: number;
  /** Change in activity from the week before, as a fraction (0.25 = 25% more), or null with nothing to compare. */
  change: number | null;
  /** The class that got the most more attention than the week before. */
  risingClass: string | null;
  next: string;
};

/**
 * Last week, in a few numbers, and one suggestion for this week. Rules for the suggestion, in order:
 * no studying (a gentle restart), goals missed by a little (one more push), recall under 70% (slow down
 * on new cards), quiz accuracy under 70% (go over mistakes), else keep the rhythm, with a nudge to set
 * a goal if there are none.
 */
export function weeklyRecap(o: { today: string; firstDay: number; rows: HistoryRow[]; sessions: Session[]; goals: Goal[]; ticks: Record<string, string[]> }): Recap {
  const thisWeek = weekOf(o.today, o.firstDay);
  const week = { start: addDays(thisWeek.start, -7), end: addDays(thisWeek.start, -1) };
  const before = { start: addDays(week.start, -7), end: addDays(week.start, -1) };
  const rows = o.rows.filter((r) => inWeek(r.day, week));
  const prev = o.rows.filter((r) => inWeek(r.day, before));
  const sum = (rs: HistoryRow[], f: (r: HistoryRow) => boolean, v: (r: HistoryRow) => number = (r) => r.n) => rs.filter(f).reduce((n, r) => n + v(r), 0);
  const activity = sum(rows, () => true);
  const prevActivity = sum(prev, () => true);
  const cards = sum(rows, (r) => r.kind === "review");
  const cardsRight = sum(rows, (r) => r.kind === "review", (r) => r.correct);
  const questions = sum(rows, (r) => r.kind === "quiz" || r.kind === "practice_test");
  const questionsRight = sum(rows, (r) => r.kind === "quiz" || r.kind === "practice_test", (r) => r.correct);
  const perDay = new Map<string, number>();
  for (const r of rows) perDay.set(r.day, (perDay.get(r.day) ?? 0) + r.n);
  const best = [...perDay].sort((a, b) => b[1] - a[1])[0];
  const perClass = (rs: HistoryRow[]) => rs.reduce((m, r) => m.set(r.subject_id, (m.get(r.subject_id) ?? 0) + r.n), new Map<string, number>());
  const nowC = perClass(rows), thenC = perClass(prev);
  const rising = [...nowC].map(([id, n]) => [id, n - (thenC.get(id) ?? 0)] as const).filter(([, d]) => d >= 10).sort((a, b) => b[1] - a[1])[0];
  const results = o.goals.map((g) => goalProgress(g, week, o.rows, o.sessions, o.ticks[g.id] ?? []));
  const goalsMet = results.filter((r) => r.done).length;
  const recallPct = cards >= 5 ? Math.round((100 * cardsRight) / cards) : null;
  const quizPct = questions >= 5 ? Math.round((100 * questionsRight) / questions) : null;
  const nearMiss = results.some((r) => !r.done && r.pct >= 0.6);

  const next = activity === 0
    ? "A fresh week. Ten minutes on your due cards today is all it takes to get going again."
    : nearMiss
      ? "You were close on a goal. One extra short session this week gets you there."
      : recallPct != null && recallPct < 70
        ? "Lots of cards slipped. Try reviewing a little every day this week rather than a lot at once."
        : quizPct != null && quizPct < 70
          ? "Go over your quiz mistakes early this week, while they're fresh."
          : o.goals.length === 0
            ? "Nice rhythm. Set a goal for this week to keep it going."
            : "Nice rhythm. Same again this week.";

  return {
    week, activity, days: perDay.size, cards, questions, recallPct, quizPct,
    bestDay: best ? { day: best[0], activity: best[1] } : null,
    goalsMet, goals: o.goals.length,
    change: prevActivity > 0 ? Math.round(((activity - prevActivity) / prevActivity) * 100) / 100 : null,
    risingClass: rising?.[0] ?? null,
    next,
  };
}

/** The recap shows on Home for the first three days of a new week, until it is closed. */
export const showRecapCard = (today: string, firstDay: number) => daysBetween(weekOf(today, firstDay).start, today) <= 2;
