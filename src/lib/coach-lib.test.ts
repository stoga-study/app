import { describe, expect, it } from "vitest";
import { addDays, answerSystem, cleanCards, contextText, crisisReply, isIsoDate, isTime, MAX_CARDS, parseCalls, stepLabel, stepSystem, validKind, type Ctx } from "../../supabase/functions/_lib/coach";

const ctx: Ctx = {
  today: "2026-10-14",
  firstName: "Sam",
  classes: [{ ref: "C1", name: "Biology", currentUnit: "U1", units: [{ ref: "U1", name: "Unit 4: Cells" }], dueCards: 12 }],
  events: [{ ref: "E1", kind: "test", title: "Unit 4 test", classRef: "C1", date: "2026-10-16", time: null, done: false, unitRefs: ["U1"] }],
  files: [{ ref: "F1", name: "Cells.pdf", classRef: "C1", unitRef: "U1" }],
  mistakes: 3,
  weakTopics: ["Osmosis"],
  planToday: ["Review 4 cards"],
};

describe("coach lib", () => {
  it("checks dates and times strictly", () => {
    expect(isIsoDate("2026-10-16")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isTime("15:30")).toBe(true);
    expect(isTime("25:00")).toBe(false);
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
    expect(validKind("exam")).toBeNull();
  });

  it("gives the model a date table, classes, files and the calendar", () => {
    const t = contextText(ctx);
    expect(t).toContain("Today is Wednesday 2026-10-14");
    expect(t).toContain("Friday 2026-10-16");
    expect(t).toContain("U1 Unit 4: Cells [current]");
    expect(t).toContain('F1 "Cells.pdf" C1 U1');
    expect(t).toContain('E1 test "Unit 4 test" C1 2026-10-16 units U1');
  });

  it("keeps only real tools, readable args and no repeats", () => {
    const seen = new Set<string>();
    const calls = parseCalls([
      { tool: "search", args: '{"query":"mitosis"}' },
      { tool: "search", args: '{"query":"mitosis"}' },
      { tool: "delete_cards", args: "{}" },
      { tool: "progress", args: "not json" },
      { tool: "files", args: "" },
    ], seen);
    expect(calls.map((c) => c.tool)).toEqual(["search", "files"]);
    // A later round can't repeat it either.
    expect(parseCalls([{ tool: "search", args: '{"query":"mitosis"}' }], seen)).toEqual([]);
  });

  it("labels steps in plain words", () => {
    const names = { cls: (r: unknown) => (r === "C1" ? "Biology" : null), unit: () => null };
    expect(stepLabel({ tool: "search", args: { query: "osmosis", class: "C1" } }, names)).toBe("Searching your notes in Biology for “osmosis”");
    expect(stepLabel({ tool: "make_cards", args: { class: "C1" } }, names)).toBe("Making flashcards in Biology");
    expect(stepLabel({ tool: "read_file", args: { file: "F1" } }, { ...names, file: () => "Cells.pdf" })).toBe("Reading Cells.pdf");
  });

  it("cleans cards the model wrote", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ front: `Q${i}`, back: "A" }));
    expect(cleanCards(many)).toHaveLength(MAX_CARDS);
    expect(cleanCards([{ front: "Q", back: "" }, { front: "Same", back: "x" }, { front: "same", back: "y" }, "junk"])).toEqual([{ front: "Same", back: "x" }]);
    expect(cleanCards("nope")).toEqual([]);
  });

  it("acknowledges stress first, and never claims what wasn't done", () => {
    expect(answerSystem("stressed")).toMatch(/acknowledges it, then ONE small concrete step/);
    expect(answerSystem(null)).toMatch(/Never claim anything else was done/);
    expect(stepSystem()).toMatch(/You cannot delete or change files, cards or quizzes/);
  });

  it("always gives the 988 line in a crisis", () => {
    expect(crisisReply("Sam")).toMatch(/^Sam, I'm really glad you told me/);
    expect(crisisReply(null)).toContain("988");
  });
});
