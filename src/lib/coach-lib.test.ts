import { describe, expect, it } from "vitest";
import { addDays, coachSystem, contextText, crisisReply, isIsoDate, isTime, validKind, type Ctx } from "../../supabase/functions/_lib/coach";

const ctx: Ctx = {
  today: "2026-10-14",
  firstName: "Sam",
  classes: [{ ref: "C1", name: "Biology", currentUnit: "U1", units: [{ ref: "U1", name: "Unit 4: Cells" }], dueCards: 12 }],
  events: [{ ref: "E1", kind: "test", title: "Unit 4 test", classRef: "C1", date: "2026-10-16", time: null, done: false, unitRefs: ["U1"] }],
  mistakes: 3,
  weakTopics: ["Osmosis"],
  planToday: ["Review 4 cards"],
};

describe("coach lib", () => {
  it("checks dates and times strictly", () => {
    expect(isIsoDate("2026-10-16")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("Friday")).toBe(false);
    expect(isTime("15:30")).toBe(true);
    expect(isTime("25:00")).toBe(false);
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
  });

  it("only accepts real kinds", () => {
    expect(validKind("test")).toBe("test");
    expect(validKind("exam")).toBeNull();
  });

  it("gives the model a date table, so weekdays need no arithmetic", () => {
    const t = contextText(ctx);
    expect(t).toContain("Today is Wednesday 2026-10-14");
    expect(t).toContain("Friday 2026-10-16");
    expect(t).toContain("U1 Unit 4: Cells [current]");
    expect(t).toContain('E1 test "Unit 4 test" C1 2026-10-16 units U1');
    expect(t).toContain("weakest topics: Osmosis");
  });

  it("acknowledges stress first when the student sounds stressed", () => {
    expect(coachSystem("stressed")).toMatch(/acknowledges it, then give ONE small concrete step/);
    expect(coachSystem(null)).not.toMatch(/They sound stressed/);
  });

  it("always gives the 988 line in a crisis", () => {
    expect(crisisReply("Sam")).toMatch(/^Sam, I'm really glad you told me/);
    expect(crisisReply(null)).toContain("988");
  });
});
