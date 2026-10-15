import { describe, expect, it } from "vitest";
import { streak } from "./streak";

// Sunday-first weeks. Today is Thursday 2026-10-15; this week is Oct 11 to 17.
const T = "2026-10-15";
const days = (...d: string[]) => new Set(d);

describe("weekly streaks", () => {
  it("counts weeks in a row that hit the target, with this week once met", () => {
    const studied = days("2026-09-28", "2026-09-30", "2026-10-02", "2026-10-05", "2026-10-07", "2026-10-09", "2026-10-12", "2026-10-13", "2026-10-15");
    const s = streak({ studied, today: T, firstDay: 0, target: 3, pauses: [] });
    expect(s).toMatchObject({ current: 3, thisWeek: 3, met: true, outOfReach: false });
    expect(s.studiedDays).toEqual(["2026-10-12", "2026-10-13", "2026-10-15"]);
  });

  it("doesn't break the streak during a week still in progress", () => {
    const s = streak({ studied: days("2026-10-05", "2026-10-07", "2026-10-09", "2026-10-12"), today: T, firstDay: 0, target: 3, pauses: [] });
    expect(s).toMatchObject({ current: 1, thisWeek: 1, met: false, outOfReach: false, daysLeft: 3 });
  });

  it("knows when a week can no longer be met", () => {
    expect(streak({ studied: days(), today: T, firstDay: 0, target: 5, pauses: [] }).outOfReach).toBe(true);
  });

  it("breaks on a missed week, and remembers the best run", () => {
    const studied = days("2026-09-21", "2026-09-22", "2026-09-23", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-12", "2026-10-13", "2026-10-14");
    expect(streak({ studied, today: T, firstDay: 0, target: 3, pauses: [] })).toMatchObject({ current: 1, best: 2 });
  });

  it("skips paused weeks: they neither break nor count", () => {
    const studied = days("2026-09-28", "2026-09-29", "2026-09-30", "2026-10-12", "2026-10-13", "2026-10-14");
    expect(streak({ studied, today: T, firstDay: 0, target: 3, pauses: ["2026-10-04"] })).toMatchObject({ current: 2 });
    // Pausing only this week does not mend last week's miss.
    expect(streak({ studied, today: T, firstDay: 0, target: 3, pauses: ["2026-10-11"] })).toMatchObject({ current: 0, best: 1, paused: true });
  });
});
