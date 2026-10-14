import { describe, expect, it } from "vitest";
import { buildPlan, reviewToday, type ExamScope } from "./plan";

const T = "2026-10-14";
const exam = (over: Partial<ExamScope> = {}): ExamScope => ({
  id: "e1", title: "Bio test", due_on: "2026-10-20", dueNow: 40, fresh: 30, reviewedToday: 0,
  reviewHref: "/review/session?subject=s1&unit=u1", mistakes: 3,
  quizzes: [{ key: "quiz:unit:u1", href: "/quiz/unit?unit=u1", label: "Unit 4" }],
  guides: [{ key: "guide:f1", href: "/sources/f1", label: "Cells.pdf", minutes: 12 }],
  ...over,
});

describe("reviewToday", () => {
  it("is everything in rotation plus a fair share of new cards", () => {
    // 10 in rotation, 30 new over 6 days = 5 a day.
    expect(reviewToday({ dueNow: 40, fresh: 30, reviewedToday: 0 }, 6)).toBe(15);
  });
  it("counts what was already reviewed today", () => {
    expect(reviewToday({ dueNow: 25, fresh: 25, reviewedToday: 5 }, 6)).toBe(0);
    expect(reviewToday({ dueNow: 0, fresh: 0, reviewedToday: 12 }, 3)).toBe(0);
  });
  it("is everything due on the last day", () => {
    expect(reviewToday({ dueNow: 40, fresh: 30, reviewedToday: 0 }, 1)).toBe(40);
  });
});

describe("buildPlan", () => {
  it("plans each day up to the day before the test", () => {
    const plan = buildPlan({ today: T, exams: [exam()], budget: 60, done: new Set() });
    expect(plan).toHaveLength(7);
    expect(plan[0].tasks.map((t) => t.kind)).toContain("review");
    expect(plan[0].tasks[0].title).toBe("Review 15 cards");
    // The test is on the 20th: nothing planned for that day.
    expect(plan[6].tasks).toHaveLength(0);
  });

  it("gets more intense in the last two days: quiz and mistakes, no new reading", () => {
    const plan = buildPlan({ today: T, exams: [exam()], budget: 60, done: new Set() });
    const dayBefore = plan[5];
    expect(dayBefore.intense).toBe(true);
    expect(dayBefore.tasks.map((t) => t.kind).sort()).toEqual(["mistakes", "quiz", "review"]);
    expect(plan[1].intense).toBe(false);
  });

  it("keeps within the budget, dropping the least important first", () => {
    const plan = buildPlan({ today: T, exams: [exam({ dueNow: 200, fresh: 0 })], budget: 15, done: new Set() });
    // Review alone is 40 minutes: it stays (a day always keeps its first task), the rest go.
    expect(plan[0].tasks.map((t) => t.kind)).toEqual(["review"]);
  });

  it("ticks off today's tasks from what was done", () => {
    const plan = buildPlan({ today: T, exams: [exam({ dueNow: 25, fresh: 25, reviewedToday: 5 })], budget: 60, done: new Set(["guide:f1", "mistakes"]) });
    const today = plan[0].tasks;
    expect(today.find((t) => t.kind === "review")).toMatchObject({ done: true, title: "Reviewed 5 cards" });
    expect(today.find((t) => t.kind === "mistakes")?.done).toBe(true);
    expect(today.find((t) => t.kind === "guide")?.done).toBe(true);
  });

  it("previews later days from what is left once today's share is done", () => {
    // 4 of 12 new cards learned today, 3 days to go: the other 8 over the next 2 days.
    const plan = buildPlan({ today: T, exams: [exam({ due_on: "2026-10-17", dueNow: 8, fresh: 8, reviewedToday: 4 })], budget: 60, done: new Set() });
    expect(plan[1].tasks[0].title).toBe("Review about 4 cards");
    expect(plan[2].tasks[0].title).toBe("Review about 4 cards");
  });

  it("puts the nearer test first and plans no further than two weeks out", () => {
    const plan = buildPlan({
      today: T,
      exams: [exam({ id: "far", title: "Far", due_on: "2026-11-30" }), exam({ id: "late", title: "Later", due_on: "2026-10-24", mistakes: 0 }), exam({ id: "soon", title: "Soon", due_on: "2026-10-16", mistakes: 0 })],
      budget: 120,
      done: new Set(),
    });
    expect(plan[0].tasks[0].examId).toBe("soon");
    expect(plan.flatMap((d) => d.tasks).some((t) => t.examId === "far")).toBe(false);
  });

  it("plans nothing without upcoming tests", () => {
    expect(buildPlan({ today: T, exams: [], budget: 30, done: new Set() }).every((d) => d.tasks.length === 0)).toBe(true);
  });
});
