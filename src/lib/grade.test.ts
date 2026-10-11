import { describe, expect, it } from "vitest";
import { gradeFor, graduationYearFor, schoolYearEnd } from "./grade";

const oct2026 = new Date(2026, 9, 11);
const jun2027 = new Date(2027, 5, 30);
const jul2027 = new Date(2027, 6, 1);

describe("grade from graduation year", () => {
  it("knows which school year it is", () => {
    expect(schoolYearEnd(oct2026)).toBe(2027);
    expect(schoolYearEnd(jun2027)).toBe(2027);
    expect(schoolYearEnd(jul2027)).toBe(2028);
  });

  it("maps classes to grades in 2026-27", () => {
    expect(gradeFor(2027, oct2026)).toBe(12);
    expect(gradeFor(2028, oct2026)).toBe(11);
    expect(gradeFor(2029, oct2026)).toBe(10);
    expect(gradeFor(2030, oct2026)).toBe(9);
  });

  it("moves everyone up on July 1", () => {
    expect(gradeFor(2029, jun2027)).toBe(10);
    expect(gradeFor(2029, jul2027)).toBe(11);
  });

  it("returns null once graduated or before 9th grade", () => {
    expect(gradeFor(2027, jul2027)).toBeNull();
    expect(gradeFor(2031, oct2026)).toBeNull();
    expect(gradeFor(null, oct2026)).toBeNull();
  });

  it("round-trips grade and graduation year", () => {
    for (const g of [9, 10, 11, 12] as const) expect(gradeFor(graduationYearFor(g, oct2026), oct2026)).toBe(g);
  });
});
