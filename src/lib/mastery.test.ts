import { describe, expect, it } from "vitest";
import { cardScore, mastery, reviewNextStep, topicBreakdown } from "./mastery";

describe("mastery", () => {
  it("scores cards by state and memory strength", () => {
    expect(cardScore({ state: 0, stability: 0 })).toBe(0);
    expect(cardScore({ state: 1, stability: 0.5 })).toBe(0.15);
    expect(cardScore({ state: 2, stability: 21 })).toBe(1);
    expect(cardScore({ state: 2, stability: 60 })).toBe(1);
    expect(cardScore({ state: 2, stability: 7 })).toBeCloseTo(0.5);
  });
  it("blends cards and quizzes, and labels it", () => {
    expect(mastery([], [])).toBeNull();
    expect(mastery([{ state: 0, stability: 0 }], [])).toMatchObject({ label: "Not started", score: 0 });
    const strong = Array.from({ length: 4 }, () => ({ state: 2, stability: 30 }));
    expect(mastery(strong, [{ correct: 9, total: 10 }])).toMatchObject({ label: "Mastered", score: 0.97, mastered: 4, quizPct: 90 });
    expect(mastery([{ state: 2, stability: 7 }, { state: 0, stability: 0 }], [])).toMatchObject({ label: "Just started", score: 0.25 });
    expect(mastery([], [{ correct: 6, total: 10 }, { correct: 0, total: 0 }])).toMatchObject({ label: "Getting there", score: 0.6, quizPct: 60 });
  });
});

describe("session summaries", () => {
  it("finds weak topics", () => {
    const topic = (q: string) => ({ a: "Causes", b: "Causes", c: "Terror", d: null }[q]);
    expect(topicBreakdown([{ q: "a", correct: true }, { q: "b", correct: false }, { q: "c", correct: false }, { q: "d", correct: true }], topic)).toEqual([
      { topic: "Terror", right: 0, total: 1, pct: 0 },
      { topic: "Causes", right: 1, total: 2, pct: 50 },
      { topic: "Other", right: 1, total: 1, pct: 100 },
    ]);
  });
  it("suggests one next step", () => {
    const base = { reviewed: 10, again: 1, left: 0, weak: 0, unitQuiz: false };
    expect(reviewNextStep({ ...base, left: 5 }).kind).toBe("keep_going");
    expect(reviewNextStep({ ...base, again: 4 }).kind).toBe("type_misses");
    expect(reviewNextStep({ ...base, weak: 2 }).kind).toBe("weak_cards");
    expect(reviewNextStep({ ...base, unitQuiz: true }).kind).toBe("unit_quiz");
    expect(reviewNextStep(base).kind).toBe("done");
  });
});
