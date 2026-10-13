import { describe, expect, it } from "vitest";
import { cleanGrade, gradeMessage, MAX_ANSWER, RATING } from "../../supabase/functions/_lib/grade";

describe("grading answers", () => {
  it("keeps the grader's output in bounds", () => {
    expect(cleanGrade({ verdict: "right", feedback: " Nice. ", missing: ["x"] })).toEqual({ verdict: "right", feedback: "Nice.", missing: [] });
    expect(cleanGrade({ verdict: "weird" as never, feedback: "", missing: ["a", " ", "b", "c", "d"] })).toEqual({
      verdict: "not_yet", feedback: "Have another look at the answer below.", missing: ["a", "b", "c"],
    });
    expect(cleanGrade(null).verdict).toBe("not_yet");
    expect(cleanGrade({ verdict: "right", feedback: "You named the author of *The Social Contract*.", missing: [] }).feedback).toBe("You named the author of The Social Contract.");
    expect(cleanGrade({ verdict: "partly", feedback: "Use x_1 and x_2.", missing: [] }).feedback).toBe("Use x_1 and x_2.");
  });
  it("maps verdicts to review ratings", () => {
    expect([RATING.right, RATING.partly, RATING.not_yet]).toEqual([3, 2, 1]);
  });
  it("builds a small message with the answer fenced", () => {
    const m = gradeMessage({ front: "Q?", back: "A", answer: "x".repeat(MAX_ANSWER + 50), page: "p".repeat(5000) });
    expect(m).toContain('Student\'s answer:\n"""');
    expect(m.length).toBeLessThan(2500 + MAX_ANSWER + 200);
    expect(gradeMessage({ front: "Q?", back: "A", answer: "B" })).not.toContain("page");
  });
});
