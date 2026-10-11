import { describe, expect, it } from "vitest";
import { catalogFor, catalogs, schoolYearLabel } from "./catalog";

const LEVELS = new Set(["AP", "H*", "H", "X", "A"]);

describe("school year catalogs", () => {
  it("labels school years from July to June", () => {
    expect(schoolYearLabel(new Date(2026, 9, 1))).toBe("2026-27");
    expect(schoolYearLabel(new Date(2027, 5, 30))).toBe("2026-27");
    expect(schoolYearLabel(new Date(2027, 6, 1))).toBe("2027-28");
  });

  it("falls back to the newest earlier catalog until the new one is published", () => {
    const newest = catalogs[catalogs.length - 1];
    expect(catalogFor("2099-00").schoolYear).toBe(newest.schoolYear);
    expect(catalogFor(newest.schoolYear).schoolYear).toBe(newest.schoolYear);
  });
});

describe.each(catalogs.map((c) => [c.schoolYear, c] as const))("catalog %s", (_year, catalog) => {
  const sections = catalog.courses.flatMap((c) => c.sections.map((s) => ({ course: c, s })));

  it("has core courses in every department", () => {
    for (const d of ["English", "Social Studies", "Mathematics", "Science", "World Languages"])
      expect(catalog.courses.some((c) => c.department === d)).toBe(true);
  });

  it("has unique course ids and section codes", () => {
    const ids = catalog.courses.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const codes = sections.map(({ s }) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("has well-formed sections", () => {
    for (const { course, s } of sections) {
      const at = `${course.title} ${s.code}`;
      expect(s.code, at).toMatch(/^\d{4}$/);
      expect(s.level === null || LEVELS.has(s.level), at).toBe(true);
      expect(s.grades.length, at).toBeGreaterThan(0);
      expect(s.grades.every((g) => g >= 9 && g <= 12), at).toBe(true);
      expect(s.name.trim().length, at).toBeGreaterThan(0);
      if (s.track) expect(s.trackNote, at).toBeTruthy();
    }
  });

  it("can tell every pair of sections in a course apart", () => {
    for (const course of catalog.courses) {
      const keys = course.sections.map((s) => [s.level, s.track, s.name, s.term].join("|"));
      const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
      // Reviewed in scripts/program-of-studies/rules.py (REVIEWED_DUPLICATE_LEVELS); the picker shows codes for these.
      if (dupes.length) expect(["Literary Foundations", "American Voices"]).toContain(course.title);
    }
  });
});
