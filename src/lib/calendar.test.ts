import { describe, expect, it } from "vitest";
import { addDays, daysBetween, monthGrid, monthTitle, shortDate, timeText, weekdayLetters, whenText } from "./calendar";
import { weekStart } from "./locale";

// Newer Intl puts a narrow no-break space before AM/PM.
const plain = (s: string) => s.replace(/[\u202f\u00a0]/g, " ");

describe("calendar dates", () => {
  it("adds days across months and years", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts whole days, even across daylight saving", () => {
    expect(daysBetween("2026-10-14", "2026-10-17")).toBe(3);
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
    expect(daysBetween("2026-10-14", "2026-10-12")).toBe(-2);
  });

  it("builds weeks that cover the whole month, from the right first day", () => {
    const sun = monthGrid(2026, 9, 0);
    expect(sun[0][0]).toBe("2026-09-27");
    expect(sun.at(-1)).toContain("2026-10-31");
    expect(sun.every((w) => w.length === 7)).toBe(true);
    expect(sun).toHaveLength(5);
    const mon = monthGrid(2026, 9, 1);
    expect(mon[0][0]).toBe("2026-09-28");
    expect(mon.at(-1)!.at(-1)).toBe("2026-11-01");
  });

  it("knows where weeks start", () => {
    expect(weekStart("en-US")).toBe(0);
    expect(weekStart("en-GB")).toBe(1);
    expect(weekStart("de-DE")).toBe(1);
    expect(weekdayLetters(0, "en-US")).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
    expect(weekdayLetters(1, "en-GB")[0]).toBe("M");
  });

  it("says when things are, in plain words", () => {
    const from = "2026-10-14";
    expect(whenText("2026-10-14", from, "en-US")).toBe("Today");
    expect(whenText("2026-10-15", from, "en-US")).toBe("Tomorrow");
    expect(whenText("2026-10-17", from, "en-US")).toBe("In 3 days");
    expect(whenText("2026-10-13", from, "en-US")).toBe("Yesterday");
    expect(whenText("2026-10-11", from, "en-US")).toBe("3 days ago");
    expect(whenText("2026-11-20", from, "en-US")).toBe("Fri, Nov 20");
  });

  it("speaks the student's language", () => {
    const from = "2026-10-14";
    expect(whenText("2026-10-15", from, "es-ES")).toBe("Mañana");
    expect(whenText("2026-10-17", from, "fr-FR")).toBe("Dans 3 jours");
    expect(whenText("2026-10-16", from, "de-DE")).toBe("Übermorgen");
    expect(shortDate("2026-11-20", "es-ES")).toMatch(/vie.*20.*nov/i);
    expect(monthTitle(2026, 9, "fr-FR")).toBe("octobre 2026");
  });

  it("writes times the way the region does", () => {
    expect(plain(timeText("15:30:00", "en-US"))).toBe("3:30 PM");
    expect(plain(timeText("00:05:00", "en-US"))).toBe("12:05 AM");
    expect(timeText("15:30:00", "en-GB")).toBe("15:30");
    expect(timeText("15:30:00", "de-DE")).toBe("15:30");
    expect(timeText(null)).toBe("");
  });
});
