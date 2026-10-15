import { describe, expect, it } from "vitest";
import { longestWeekRun, milestones, newlyReached, type MilestoneInput } from "./milestones";

const base: MilestoneInput = { studied: new Set(), today: "2026-10-15", firstDay: 0, cardsReviewed: 0, cardsLearned: 0, unitsMastered: 0, practiceTests: 0, bestPracticeTest: null, perfectQuizzes: 0, ownNotes: 0 };
const ids = (i: Partial<MilestoneInput>) => milestones({ ...base, ...i }).filter((m) => m.reached).map((m) => m.id);

describe("milestones", () => {
  it("starts with nothing reached", () => {
    expect(ids({})).toEqual([]);
  });

  it("reaches each from real numbers", () => {
    expect(ids({ cardsReviewed: 3, cardsLearned: 120, unitsMastered: 1 })).toEqual(["first-review", "learned-100", "first-unit"]);
    expect(ids({ practiceTests: 2, bestPracticeTest: 92, perfectQuizzes: 1, ownNotes: 5 })).toEqual(["first-test", "test-90", "perfect-quiz", "notes-5"]);
  });

  it("counts weeks in a row with any studying", () => {
    const studied = new Set(["2026-09-21", "2026-09-29", "2026-10-06", "2026-10-15", "2026-08-01"]);
    expect(longestWeekRun(studied, "2026-10-15", 0)).toBe(4);
    expect(ids({ studied })).toContain("weeks-4");
    expect(longestWeekRun(new Set(), "2026-10-15", 0)).toBe(0);
  });

  it("celebrates only what hasn't been noticed yet", () => {
    const all = milestones({ ...base, cardsReviewed: 1, cardsLearned: 100 });
    expect(newlyReached(all, { "first-review": "2026-10-01" }).map((m) => m.id)).toEqual(["learned-100"]);
  });
});
