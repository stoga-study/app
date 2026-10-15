// Study history: the heatmap, consistency, weekly trends and per-class totals. Pure, unit tested.
import { addDays, daysBetween, fromIso } from "./calendar";

export type HistoryRow = { day: string; subject_id: string; kind: "review" | "quiz" | "practice_test" | "tutor"; n: number; correct: number };
export type DayTotal = { activity: number; reviews: number; quiz: number; tests: number; tutor: number };

const empty = (): DayTotal => ({ activity: 0, reviews: 0, quiz: 0, tests: 0, tutor: 0 });

/** Everything studied each day. Activity counts each card, quiz answer, practice-test question and tutor question once. */
export function dayTotals(rows: HistoryRow[]) {
  const out = new Map<string, DayTotal>();
  for (const r of rows) {
    const t = out.get(r.day) ?? empty();
    t.activity += r.n;
    if (r.kind === "review") t.reviews += r.n;
    if (r.kind === "quiz") t.quiz += r.n;
    if (r.kind === "practice_test") t.tests += r.n;
    if (r.kind === "tutor") t.tutor += r.n;
    out.set(r.day, t);
  }
  return out;
}

/** How busy a day was, 0 (nothing) to 4. */
export const level = (activity: number) => (activity <= 0 ? 0 : activity < 10 ? 1 : activity < 25 ? 2 : activity < 50 ? 3 : 4);

export type HeatCell = { day: string; total: DayTotal; level: number; future: boolean };

/** `weeks` columns ending with the week of `end`, each starting on `firstDay` (0 = Sunday). */
export function heatmap(totals: Map<string, DayTotal>, end: string, weeks: number, firstDay: number): HeatCell[][] {
  const endDow = fromIso(end).getDay();
  const lastWeekStart = addDays(end, -((endDow - firstDay + 7) % 7));
  const start = addDays(lastWeekStart, -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = addDays(start, w * 7 + d);
      const total = totals.get(day) ?? empty();
      return { day, total, level: level(total.activity), future: day > end };
    }),
  );
}

/** Over the last `days` days: how many had any studying, the average a week, and the busiest weekday. */
export function consistency(totals: Map<string, DayTotal>, end: string, days = 28) {
  let active = 0;
  const byDow = Array(7).fill(0) as number[];
  for (let i = 0; i < days; i++) {
    const day = addDays(end, -i);
    const t = totals.get(day);
    if (t && t.activity > 0) {
      active++;
      byDow[fromIso(day).getDay()] += t.activity;
    }
  }
  const best = byDow.some((x) => x > 0) ? byDow.indexOf(Math.max(...byDow)) : null;
  return { active, days, perWeek: Math.round((active / days) * 7 * 10) / 10, bestWeekday: best };
}

export type WeekPoint = { start: string; pct: number | null; n: number };

/**
 * Weekly accuracy for the last `weeks` weeks (oldest first): card recall ("review") or quiz and
 * practice-test accuracy ("quiz"). A week with fewer than 5 answers has no percentage.
 */
export function weeklyTrend(rows: HistoryRow[], end: string, weeks: number, what: "review" | "quiz", firstDay: number): WeekPoint[] {
  const endDow = fromIso(end).getDay();
  const lastWeekStart = addDays(end, -((endDow - firstDay + 7) % 7));
  const points: WeekPoint[] = Array.from({ length: weeks }, (_, i) => ({ start: addDays(lastWeekStart, -7 * (weeks - 1 - i)), pct: null, n: 0 }));
  const right = Array(weeks).fill(0) as number[];
  for (const r of rows) {
    if (what === "review" ? r.kind !== "review" : r.kind !== "quiz" && r.kind !== "practice_test") continue;
    const offset = daysBetween(points[0].start, r.day);
    if (offset < 0 || r.day > end) continue;
    const i = Math.floor(offset / 7);
    if (i >= weeks) continue;
    points[i].n += r.n;
    right[i] += r.correct;
  }
  return points.map((p, i) => ({ ...p, pct: p.n >= 5 ? Math.round((100 * right[i]) / p.n) : null }));
}

export type ClassProgress = { subject_id: string; recent: number; before: number; recallPct: number | null; quizPct: number | null; trend: "up" | "down" | "flat" | "new" };

/** Per class: activity in the last 30 days against the 30 before, and recent recall and quiz accuracy. */
export function byClass(rows: HistoryRow[], end: string): ClassProgress[] {
  const m = new Map<string, { recent: number; before: number; rN: number; rC: number; qN: number; qC: number }>();
  for (const r of rows) {
    const ago = daysBetween(r.day, end);
    if (ago < 0 || ago >= 60) continue;
    const x = m.get(r.subject_id) ?? { recent: 0, before: 0, rN: 0, rC: 0, qN: 0, qC: 0 };
    if (ago < 30) {
      x.recent += r.n;
      if (r.kind === "review") { x.rN += r.n; x.rC += r.correct; }
      if (r.kind === "quiz" || r.kind === "practice_test") { x.qN += r.n; x.qC += r.correct; }
    } else x.before += r.n;
    m.set(r.subject_id, x);
  }
  return [...m].map(([subject_id, x]): ClassProgress => ({
    subject_id,
    recent: x.recent,
    before: x.before,
    recallPct: x.rN >= 5 ? Math.round((100 * x.rC) / x.rN) : null,
    quizPct: x.qN >= 5 ? Math.round((100 * x.qC) / x.qN) : null,
    trend: x.before === 0 ? "new" : x.recent > x.before * 1.15 ? "up" : x.recent < x.before * 0.85 ? "down" : "flat",
  })).sort((a, b) => b.recent - a.recent);
}
