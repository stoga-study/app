import { describe, expect, it } from "vitest";
import { cardWeakness, clock, minutesFor, pickTest, scoreTest, type CardPick, type McPick } from "./practiceTest";

// A fixed sequence, so picks are repeatable.
const seeded = () => {
  let x = 7;
  return () => ((x = (x * 9301 + 49297) % 233280) / 233280);
};
const mc = (n: number, o: Partial<McPick> = {}): McPick[] => Array.from({ length: n }, (_, i) => ({ id: `q${i}`, topic: null, missed: false, ...o }));
const cards = (n: number): CardPick[] => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, state: 2, lapses: 0, difficulty: 3, ...(i === 0 ? { lapses: 4, state: 3 } : {}) }));

describe("pickTest", () => {
  it("mixes multiple choice and short answer, more written for AP", () => {
    const reg = pickTest({ mc: mc(30), cards: cards(30), n: 20, ap: false, weakTopics: [], rand: seeded() });
    const ap = pickTest({ mc: mc(30), cards: cards(30), n: 20, ap: true, weakTopics: [], rand: seeded() });
    expect(reg).toHaveLength(20);
    expect(reg.filter((i) => i.kind === "sa")).toHaveLength(5);
    expect(ap.filter((i) => i.kind === "sa")).toHaveLength(8);
  });

  it("asks questions missed before, and weak topics, first", () => {
    const pool = [...mc(10), { id: "missed", topic: null, missed: true }, { id: "weak", topic: "Osmosis", missed: false }];
    const t = pickTest({ mc: pool, cards: [], n: 2, ap: false, weakTopics: ["Osmosis"], rand: seeded() });
    expect(t.map((i) => i.id).sort()).toEqual(["missed", "weak"]);
  });

  it("includes the weakest cards", () => {
    const t = pickTest({ mc: mc(30), cards: cards(40), n: 20, ap: false, weakTopics: [], rand: seeded() });
    expect(t.some((i) => i.id === "c0")).toBe(true);
  });

  it("fills in from the other kind when one runs short", () => {
    expect(pickTest({ mc: mc(3), cards: cards(30), n: 10, ap: false, weakTopics: [], rand: seeded() }).filter((i) => i.kind === "sa")).toHaveLength(7);
    expect(pickTest({ mc: mc(30), cards: [], n: 10, ap: true, weakTopics: [], rand: seeded() })).toHaveLength(10);
    expect(pickTest({ mc: mc(2), cards: cards(1), n: 10, ap: false, weakTopics: [], rand: seeded() })).toHaveLength(3);
  });
});

describe("timing and scoring", () => {
  it("allows 75 seconds a choice question and 2 minutes a written one", () => {
    expect(minutesFor([{ kind: "mc", id: "a" }, { kind: "mc", id: "b" }, { kind: "sa", id: "c" }])).toBe(5);
  });
  it("scores partly right as a half", () => {
    expect(scoreTest([{ kind: "mc", correct: true }, { kind: "mc", correct: false }, { kind: "sa", verdict: "partly" }, { kind: "sa", verdict: null }])).toEqual({ points: 1.5, total: 4, pct: 38 });
  });
  it("ranks weak cards", () => {
    expect(cardWeakness({ id: "x", state: 3, lapses: 2, difficulty: 6 })).toBe(9);
  });
  it("shows a clock", () => {
    expect(clock(725)).toBe("12:05");
    expect(clock(-3)).toBe("0:00");
  });
});
