import { describe, expect, it } from "vitest";
import { byClass, consistency, dayTotals, heatmap, level, weeklyTrend, type HistoryRow } from "./history";

const E = "2026-10-15"; // a Thursday
const r = (day: string, kind: HistoryRow["kind"], n: number, correct = 0, subject_id = "bio"): HistoryRow => ({ day, subject_id, kind, n, correct });

describe("study history", () => {
  const rows = [r("2026-10-15", "review", 30, 24), r("2026-10-15", "tutor", 3), r("2026-10-13", "quiz", 10, 7), r("2026-10-06", "review", 12, 6), r("2026-09-01", "review", 8, 8, "chem")];

  it("adds up each day", () => {
    const t = dayTotals(rows);
    expect(t.get("2026-10-15")).toEqual({ activity: 33, reviews: 30, quiz: 0, tests: 0, tutor: 3 });
    expect(level(0)).toBe(0);
    expect(level(9)).toBe(1);
    expect(level(33)).toBe(3);
    expect(level(80)).toBe(4);
  });

  it("lays out the heatmap by week, from the first day of the week", () => {
    const sun = heatmap(dayTotals(rows), E, 3, 0);
    expect(sun).toHaveLength(3);
    expect(sun[2][0].day).toBe("2026-10-11");
    expect(sun[2][4]).toMatchObject({ day: "2026-10-15", level: 3, future: false });
    expect(sun[2][5].future).toBe(true);
    const mon = heatmap(dayTotals(rows), E, 1, 1);
    expect(mon[0][0].day).toBe("2026-10-12");
  });

  it("measures consistency", () => {
    expect(consistency(dayTotals(rows), E, 28)).toEqual({ active: 3, days: 28, perWeek: 0.8, bestWeekday: 4 });
    expect(consistency(new Map(), E).bestWeekday).toBeNull();
  });

  it("tracks weekly recall, skipping weeks with too few answers", () => {
    const w = weeklyTrend(rows, E, 3, "review", 0);
    expect(w.map((p) => p.start)).toEqual(["2026-09-27", "2026-10-04", "2026-10-11"]);
    expect(w.map((p) => p.pct)).toEqual([null, 50, 80]);
    expect(weeklyTrend(rows, E, 3, "quiz", 0)[2]).toMatchObject({ n: 10, pct: 70 });
  });

  it("compares each class's last 30 days with the 30 before", () => {
    const c = byClass([...rows, r("2026-09-05", "review", 100, 90)], E);
    expect(c[0]).toMatchObject({ subject_id: "bio", recent: 55, before: 100, recallPct: 71, quizPct: 70, trend: "down" });
    expect(c.find((x) => x.subject_id === "chem")).toMatchObject({ recent: 0, before: 8, trend: "down" });
  });
});
