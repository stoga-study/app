import { describe, expect, it } from "vitest";
import { checkOptions, optionsKey, planTasks, splitAcross, suggestAmounts } from "../../supabase/functions/_lib/options";

const ESSENTIAL = { cards: 60, quiz: 25, guide: 12 };

describe("checkOptions", () => {
  it("accepts a valid choice and ignores amounts for parts not chosen", () => {
    const r = checkOptions({ parts: { notes: true, cards: true }, amounts: { cards: 40, quiz: 999 } }, ESSENTIAL);
    expect(r).toEqual({ ok: true, options: { parts: { notes: true, cards: true, quiz: false, guide: false }, amounts: { cards: 40, quiz: 0, guide: 0 } } });
  });
  it("refuses nothing chosen, bad numbers and anything over the plan's cap", () => {
    expect(checkOptions({ parts: {} }, ESSENTIAL)).toEqual({ ok: false, error: "none_chosen" });
    expect(checkOptions({ parts: { cards: true }, amounts: { cards: 2.5 } }, ESSENTIAL)).toEqual({ ok: false, error: "bad_options" });
    expect(checkOptions({ parts: { cards: true }, amounts: { cards: 0 } }, ESSENTIAL)).toEqual({ ok: false, error: "bad_options" });
    expect(checkOptions({ parts: { cards: true }, amounts: { cards: 61 } }, ESSENTIAL)).toEqual({ ok: false, error: "over_cap" });
    expect(checkOptions({ parts: { quiz: true }, amounts: { quiz: 26 } }, ESSENTIAL)).toEqual({ ok: false, error: "over_cap" });
    expect(checkOptions(null, ESSENTIAL)).toEqual({ ok: false, error: "bad_options" });
  });
});

describe("suggestAmounts", () => {
  it("scales with the file and stays within caps", () => {
    expect(suggestAmounts(2_000, ESSENTIAL)).toEqual({ cards: 5, quiz: 5, guide: 3 });
    expect(suggestAmounts(20_000, ESSENTIAL)).toEqual({ cards: 44, quiz: 13, guide: 5 });
    expect(suggestAmounts(500_000, ESSENTIAL)).toEqual({ cards: 60, quiz: 20, guide: 8 });
  });
});

describe("splitAcross", () => {
  it("splits in proportion to text and always adds up", () => {
    expect(splitAcross(40, [10_000, 10_000])).toEqual([20, 20]);
    expect(splitAcross(10, [9_000, 1_000])).toEqual([9, 1]);
    const parts = splitAcross(37, [3_000, 14_000, 14_000, 500]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(37);
    expect(splitAcross(5, [0, 0])).toEqual([3, 2]);
    expect(splitAcross(3, [])).toEqual([]);
  });
});

describe("planTasks and optionsKey", () => {
  it("only plans the chosen parts", () => {
    expect(planTasks(2, { notes: false, cards: true, quiz: true, guide: false })).toEqual([{ kind: "cards", part: 0 }, { kind: "cards", part: 1 }, { kind: "quiz" }]);
    expect(planTasks(1, { notes: false, cards: false, quiz: false, guide: false })).toEqual([]);
  });
  it("names identical requests identically", () => {
    const o = { parts: { notes: true, cards: true, quiz: false, guide: true }, amounts: { cards: 40, quiz: 0, guide: 6 } };
    expect(optionsKey(o)).toBe("nc40g6");
  });
});
