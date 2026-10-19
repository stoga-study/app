import { describe, expect, it } from "vitest";
import { actionProblem, classesInMessage, datesInMessage, listLines, withoutLists, withoutRefs } from "../../supabase/functions/_lib/coach";

const today = "2026-10-14"; // a Wednesday
const classes = [{ ref: "C1", name: "Biology" }, { ref: "C2", name: "Chemistry" }, { ref: "C3", name: "English 11" }];
const ctx = { today, classes: classes.map((c) => ({ ...c, currentUnit: null, units: [], dueCards: 0 })) };
const call = (tool: string, args: Record<string, unknown>) => ({ tool, args }) as Parameters<typeof actionProblem>[0];

describe("coach action checks", () => {
  it("works out the days a message names", () => {
    expect(datesInMessage("bio test friday on unit 4", today)).toEqual([{ words: "friday", date: "2026-10-16" }]);
    expect(datesInMessage("my chem test got moved to next monday", today)).toEqual([{ words: "next monday", date: "2026-10-19" }]);
    expect(datesInMessage("due tomorrow", today)).toEqual([{ words: "tomorrow", date: "2026-10-15" }]);
    expect(datesInMessage("it's on wednesday", today)[0].date).toBe("2026-10-21");
  });

  it("finds the class a message names", () => {
    expect(classesInMessage("write my study plan for the chem test down", classes)).toEqual(["C2"]);
    expect(classesInMessage("bio test friday", classes)).toEqual(["C1"]);
    expect(classesInMessage("how am i doing", classes)).toEqual([]);
  });

  it("skips actions the student didn't ask for", () => {
    expect(actionProblem(call("make_cards", { class: "C1", cards: [{}, {}] }), "finished worksheet 3 finally", ctx)).toMatch(/did not ask/);
    expect(actionProblem(call("write_note", { class: "C1", title: "x", body: "y" }), "bio test friday on unit 4", ctx)).toMatch(/did not ask/);
    expect(actionProblem(call("complete_event", { event: "E1" }), "finished worksheet 3 finally", ctx)).toBeNull();
  });

  it("adds the test itself, on the day they said, in the class they said", () => {
    expect(actionProblem(call("add_event", { kind: "other", title: "Review Biology Unit 4", date: "2026-10-15", class: "C1" }), "bio test friday on unit 4", ctx)).toMatch(/add the test itself/);
    expect(actionProblem(call("add_event", { kind: "test", title: "Unit 4 test", date: "2026-10-23", class: "C1" }), "bio test friday on unit 4", ctx)).toMatch(/2026-10-16/);
    expect(actionProblem(call("add_event", { kind: "test", title: "Unit 4 test", date: "2026-10-16", class: "C2" }), "bio test friday on unit 4", ctx)).toMatch(/Biology/);
    expect(actionProblem(call("add_event", { kind: "test", title: "Unit 4 test", date: "2026-10-16", class: "C1" }), "bio test friday on unit 4", ctx)).toBeNull();
    expect(actionProblem(call("update_event", { event: "E2", date: "2026-10-26" }), "my chem test got moved to next monday", ctx)).toMatch(/2026-10-19/);
  });

  it("makes cards from their notes only after looking at them", () => {
    const five = { class: "C1", cards: [{}, {}, {}, {}, {}] };
    const ask = "make me 5 flashcards about cell organelles from my bio notes";
    expect(actionProblem(call("make_cards", five), ask, ctx, false)).toMatch(/search/);
    expect(actionProblem(call("make_cards", five), ask, ctx, true)).toBeNull();
    expect(actionProblem(call("make_cards", five), "make me 5 flashcards on the krebs cycle", ctx, false)).toBeNull();
  });

  it("makes as many cards as asked", () => {
    expect(actionProblem(call("make_cards", { class: "C1", cards: [{}, {}] }), "make me 5 flashcards about cell organelles from my bio notes", ctx, true)).toMatch(/exactly 5/);
    expect(actionProblem(call("make_cards", { class: "C1", cards: [{}, {}, {}, {}, {}] }), "make me 5 flashcards about cell organelles from my bio notes", ctx, true)).toBeNull();
  });

  it("files a note in the class they named", () => {
    expect(actionProblem(call("write_note", { class: "C1", title: "Plan", body: "x" }), "can you write my study plan for the chem test down as a note", ctx)).toMatch(/Chemistry/);
  });
});

describe("coach answer clean-up", () => {
  const names = new Map([["F1", "Cell structure notes"], ["C1", "Biology"], ["E2", "Unit 2 test"]]);
  it("never shows internal labels", () => {
    expect(withoutRefs('open up F1 "Cell structure notes" and read page 1', names)).toBe('open up "Cell structure notes" and read page 1');
    expect(withoutRefs("Review your Biology (C1) cards", names)).toBe("Review your Biology cards");
    expect(withoutRefs("Start with F1 today", names)).toBe("Start with “Cell structure notes” today");
    expect(withoutRefs("Cross them and look at the F1 generation", names)).toBe("Cross them and look at the F1 generation");
    expect(withoutRefs("E9 is not a thing", names)).toBe("E9 is not a thing");
  });
  it("finds and drops lists", () => {
    const reply = "That sounds like a lot.\n\nHere's what's on your radar:\n- Worksheet 3 today\n- Unit 2 test Oct 24\n\nOpen your notes for five minutes.";
    expect(listLines(reply)).toBe(2);
    expect(withoutLists(reply)).toBe("That sounds like a lot.\n\nOpen your notes for five minutes.");
  });
});
