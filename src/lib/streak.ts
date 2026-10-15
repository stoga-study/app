// Optional weekly streaks: weeks in a row with at least the student's chosen number of study days.
// Days not needed are rest days, never paid for. Pure, unit tested.
import { addDays, daysBetween } from "./calendar";
import { weekOf } from "./goals";

export type StreakState = {
  /** Weeks in a row met, counting this one once it is met. */
  current: number;
  best: number;
  /** Study days so far this week, and the days of this week studied (for the dots). */
  thisWeek: number;
  studiedDays: string[];
  target: number;
  met: boolean;
  /** This week can no longer be met (too few days left); it will not count, and that is fine. */
  outOfReach: boolean;
  paused: boolean;
  daysLeft: number;
};

/**
 * `studied` holds every day with real studying. Weeks run from `firstDay`. A paused week is skipped:
 * it neither breaks nor adds to a streak. This week only breaks the streak once it is over.
 */
export function streak(o: { studied: Set<string>; today: string; firstDay: number; target: number; pauses: string[] }): StreakState {
  const week = weekOf(o.today, o.firstDay);
  const pauses = new Set(o.pauses);
  const daysIn = (start: string) => Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter((d) => o.studied.has(d));
  const studiedDays = daysIn(week.start).filter((d) => d <= o.today);
  const met = studiedDays.length >= o.target;
  const daysLeft = daysBetween(o.today, week.end) + 1 - (o.studied.has(o.today) ? 1 : 0);
  const paused = pauses.has(week.start);

  // Earlier weeks, newest first, until a missed (unpaused) week or the start of any studying.
  const earliest = [...o.studied].sort()[0];
  let current = met && !paused ? 1 : 0;
  let run = current, best = current;
  let broken = false;
  for (let start = addDays(week.start, -7); earliest && start >= addDays(earliest, -6); start = addDays(start, -7)) {
    if (pauses.has(start)) continue;
    if (daysIn(start).length >= o.target) {
      run++;
      if (!broken) current = run;
    } else {
      broken = true;
      run = 0;
    }
    best = Math.max(best, run);
  }
  return { current, best: Math.max(best, current), thisWeek: studiedDays.length, studiedDays, target: o.target, met, outOfReach: !met && studiedDays.length + daysLeft < o.target, paused, daysLeft };
}
