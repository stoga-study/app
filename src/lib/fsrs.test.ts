import { createEmptyCard, Rating } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { intervalLabel, isWeak, previewIntervals, rate, toRow } from "./fsrs";

const now = new Date("2026-10-12T15:00:00Z");
const fresh = toRow(createEmptyCard(now));

describe("FSRS scheduling", () => {
  it("brings a new card back sooner for Again than for Easy", () => {
    const again = new Date(rate(fresh, Rating.Again, now).row.due).getTime();
    const easy = new Date(rate(fresh, Rating.Easy, now).row.due).getTime();
    expect(again).toBeLessThan(easy);
    expect(again - now.getTime()).toBeLessThan(15 * 60_000);
    expect(easy - now.getTime()).toBeGreaterThan(24 * 3600_000);
  });
  it("counts reps and lapses", () => {
    const r1 = rate(fresh, Rating.Good, now).row;
    const later = new Date(new Date(r1.due).getTime() + 60_000);
    const r2 = rate(r1, Rating.Good, later).row;
    expect(r2.reps).toBe(2);
    const r3 = rate(r2, Rating.Again, new Date(new Date(r2.due).getTime() + 60_000)).row;
    expect(r3.lapses).toBeGreaterThanOrEqual(r2.lapses);
  });
  it("labels intervals for the rating buttons", () => {
    expect(intervalLabel(new Date(now.getTime() + 30_000), now)).toBe("<1 min");
    expect(intervalLabel(new Date(now.getTime() + 10 * 60_000), now)).toBe("10 min");
    expect(intervalLabel(new Date(now.getTime() + 3 * 86400_000), now)).toBe("3 days");
    expect(previewIntervals(fresh, now).map((p) => p.label)).toEqual(["Again", "Hard", "Good", "Easy"]);
  });
  it("schedules further out for lower retention", () => {
    // A card with some history, so the interval is driven by stability rather than learning steps.
    let row = rate(fresh, Rating.Good, now).row;
    for (let k = 0; k < 3; k++) row = rate(row, Rating.Good, new Date(new Date(row.due).getTime() + 60_000)).row;
    const at = new Date(new Date(row.due).getTime() + 60_000);
    const days = (ret: number) => (new Date(rate(row, Rating.Good, at, ret).row.due).getTime() - at.getTime()) / 86400_000;
    expect(days(0.85)).toBeGreaterThan(days(0.9));
    expect(days(0.9)).toBeGreaterThan(days(0.95));
  });
  it("finds weak cards", () => {
    expect(isWeak({ state: 2, lapses: 2, difficulty: 3 })).toBe(true);
    expect(isWeak({ state: 2, lapses: 0, difficulty: 7.4 })).toBe(true);
    expect(isWeak({ state: 2, lapses: 1, difficulty: 5 })).toBe(false);
    expect(isWeak({ state: 0, lapses: 0, difficulty: 9 })).toBe(false);
  });
});
