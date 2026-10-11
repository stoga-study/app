import { createEmptyCard, Rating } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { intervalLabel, previewIntervals, rate, toRow } from "./fsrs";

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
});
