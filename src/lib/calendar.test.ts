import { describe, expect, it } from "vitest";
import { addDays, daysBetween, monthGrid, timeText, whenText } from "./calendar";

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

  it("builds Sunday-first weeks that cover the whole month", () => {
    const oct = monthGrid(2026, 9);
    expect(oct[0][0]).toBe("2026-09-27");
    expect(oct[0]).toContain("2026-10-01");
    expect(oct.at(-1)).toContain("2026-10-31");
    expect(oct.every((w) => w.length === 7)).toBe(true);
    expect(oct).toHaveLength(5);
    // A month that ends on a Saturday gets no extra week.
    expect(monthGrid(2026, 9).at(-1)!.at(-1)).toBe("2026-10-31");
  });

  it("says when things are, in plain words", () => {
    const from = "2026-10-14";
    expect(whenText("2026-10-14", from)).toBe("Today");
    expect(whenText("2026-10-15", from)).toBe("Tomorrow");
    expect(whenText("2026-10-17", from)).toBe("In 3 days");
    expect(whenText("2026-10-13", from)).toBe("Yesterday");
    expect(whenText("2026-10-11", from)).toBe("3 days ago");
    expect(whenText("2026-11-20", from)).toBe("Fri, Nov 20");
  });

  it("formats times", () => {
    expect(timeText("15:30:00")).toBe("3:30 PM");
    expect(timeText("00:05:00")).toBe("12:05 AM");
    expect(timeText(null)).toBe("");
  });
});
