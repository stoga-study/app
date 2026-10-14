import { describe, expect, it } from "vitest";
import { coachNudge, type NudgeInput } from "./nudge";

const base: NudgeInput = { hasClasses: true, exams: [], overdue: 0 };
const exam = (o: Partial<NudgeInput["exams"][number]> = {}) => ({ title: "Unit 4 test", className: "Biology", daysLeft: 3, fresh: 10, cards: 20, readiness: null, ...o });

describe("coachNudge", () => {
  it("wishes luck on test day", () => {
    expect(coachNudge({ ...base, exams: [exam({ daysLeft: 0 })] })?.text).toBe("Unit 4 test is today. You've put the work in, so trust it.");
  });
  it("offers tonight's plan when half the cards are new", () => {
    expect(coachNudge({ ...base, exams: [exam()] })).toEqual({
      text: "Biology Unit 4 test in 3 days, and 10 of its 20 cards are still new. Want tonight's plan?",
      say: "Make me a plan for tonight for my Unit 4 test",
      cta: "Get tonight's plan",
    });
    expect(coachNudge({ ...base, exams: [exam({ fresh: 20, daysLeft: 1 })] })?.text).toBe("Biology Unit 4 test tomorrow, and none of its cards are started yet. Want tonight's plan?");
  });
  it("does not repeat the class name, even one with brackets", () => {
    expect(coachNudge({ ...base, exams: [exam({ title: "Biology midterm" })] })?.text).toMatch(/^Biology midterm in 3 days/);
    expect(coachNudge({ ...base, exams: [exam({ className: "AP Calculus (BC)", title: "Limits quiz" })] })?.text).toMatch(/^AP Calculus \(BC\) Limits quiz in 3 days/);
  });
  it("uses the readiness reason otherwise", () => {
    const r = coachNudge({ ...base, exams: [exam({ fresh: 2, readiness: { level: "needs", label: "Needs work", reason: "Quizzes at 50%" } })] });
    expect(r?.text).toBe("Biology Unit 4 test in 3 days. Quizzes at 50%. Want help deciding what to do first?");
  });
  it("says so when looking ready", () => {
    expect(coachNudge({ ...base, exams: [exam({ fresh: 0, readiness: { level: "ready", label: "Ready", reason: "x" } })] })?.text).toMatch(/looking ready/);
  });
  it("helps catch up on overdue homework when no test is close", () => {
    expect(coachNudge({ ...base, exams: [exam({ daysLeft: 12 })], overdue: 2 })?.text).toBe("2 things are past due. Want to sort out when to get them done?");
  });
  it("invites adding a test to an empty calendar, and says nothing without classes", () => {
    expect(coachNudge(base)?.cta).toBe("Open the coach");
    expect(coachNudge({ ...base, hasClasses: false })).toBeNull();
  });
});
