import { describe, expect, it } from "vitest";
import { readiness } from "./readiness";

const cards = (n: Record<number, number>) => Object.entries(n).flatMap(([state, k]) => Array.from({ length: k }, () => ({ state: Number(state) })));

describe("readiness", () => {
  it("is null with nothing to measure", () => {
    expect(readiness({ cards: [], quizzes: [], quizzesAvailable: 0, mistakes: 0 })).toBeNull();
  });

  it("needs work when most cards are unseen", () => {
    expect(readiness({ cards: cards({ 0: 8, 2: 2 }), quizzes: [], quizzesAvailable: 0, mistakes: 0 })).toEqual({ level: "needs", label: "Needs work", reason: "8 cards not studied yet" });
  });

  it("needs work on a low quiz average, even with cards done", () => {
    const r = readiness({ cards: cards({ 2: 10 }), quizzes: [{ correct: 5, total: 10 }], quizzesAvailable: 1, mistakes: 5 });
    expect(r).toMatchObject({ level: "needs", reason: "Quizzes at 50%" });
  });

  it("is getting there when cards are studied but still being learned", () => {
    const r = readiness({ cards: cards({ 1: 4, 2: 6 }), quizzes: [{ correct: 9, total: 10 }], quizzesAvailable: 1, mistakes: 0 });
    expect(r).toMatchObject({ level: "getting", reason: "4 cards still being learned" });
  });

  it("is not ready until an available quiz is taken", () => {
    const r = readiness({ cards: cards({ 2: 10 }), quizzes: [], quizzesAvailable: 2, mistakes: 0 });
    expect(r).toMatchObject({ level: "getting", reason: "No practice quiz taken yet" });
  });

  it("is ready with cards studied and remembered and quizzes strong", () => {
    const r = readiness({ cards: cards({ 2: 19, 1: 1 }), quizzes: [{ correct: 17, total: 20 }], quizzesAvailable: 1, mistakes: 2 });
    expect(r).toEqual({ level: "ready", label: "Ready", reason: "All 20 cards studied, quizzes at 85%" });
  });

  it("works with quizzes only", () => {
    expect(readiness({ cards: [], quizzes: [{ correct: 9, total: 10 }], quizzesAvailable: 1, mistakes: 0 })).toMatchObject({ level: "ready", reason: "Quizzes at 90%" });
  });
});
