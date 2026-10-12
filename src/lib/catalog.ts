import { schoolYearEnd, type Grade } from "./grade";

// Core classes from the Conestoga High School Program of Studies.
// Rebuilt with scripts/program-of-studies when a new edition comes out.
export type Level = "AP" | "H*" | "H" | "X" | "A";
export type Section = {
  code: string;
  level: Level | null;
  /** Math track ("AB" or "BC"): a different version of the course, not just a level. */
  track: "AB" | "BC" | null;
  trackNote: string | null;
  name: string;
  /** "Semester 1" when a course's sections are split by term. */
  term: string | null;
  grades: number[];
  approvalGrades: number[];
};
export type Course = {
  id: string;
  title: string;
  department: string;
  credits: number | null;
  duration: string | null;
  prerequisite: string | null;
  description: string;
  page: number;
  sections: Section[];
};
export type Catalog = { school: string; schoolYear: string; source: string; courses: Course[] };

// One file per school year in src/data/catalogs, added by the yearly update workflow.
const files = import.meta.glob<Catalog>("../data/catalogs/*.json", { eager: true, import: "default" });
export const catalogs = Object.values(files).sort((a, b) => a.schoolYear.localeCompare(b.schoolYear));

/** "2026-27" for dates from July 2026 to June 2027. */
export function schoolYearLabel(now = new Date()) {
  const end = schoolYearEnd(now);
  return `${end - 1}-${String(end).slice(2)}`;
}

/** The catalog for a school year, or the newest earlier one if that year's is not out yet. */
export function catalogFor(year: string): Catalog {
  return catalogs.find((c) => c.schoolYear === year) ?? [...catalogs].reverse().find((c) => c.schoolYear < year) ?? catalogs[0];
}

export const currentSchoolYear = schoolYearLabel();
export const catalog = catalogFor(currentSchoolYear);
/** False while the new year's Program of Studies has not been published yet. */
export const catalogIsCurrent = catalog.schoolYear === currentSchoolYear;
export const DEPARTMENTS = ["English", "Social Studies", "Mathematics", "Science", "World Languages"] as const;

export const LEVEL_LABEL: Record<Level, string> = {
  AP: "AP",
  "H*": "Honors (AP weight)",
  H: "Honors",
  X: "Accelerated",
  A: "Academic",
};

const byId = new Map(catalog.courses.map((c) => [c.id, c]));
export const findCourse = (id: string) => byId.get(id);
export const findSection = (course: Course, code: string) => course.sections.find((s) => s.code === code);

export const sectionsForGrade = (course: Course, grade: Grade | null) =>
  grade ? course.sections.filter((s) => s.grades.includes(grade)) : course.sections;

/** A choice in the class picker: one or more sections that are the same class to a student. */
export type Option = Section & { codes: string[] };

/**
 * Sections with the same name, level, track and term are one choice. The Program of Studies lists some
 * classes twice at one level (Literary Foundations 0301 and 0311, both Accelerated) without saying how
 * they differ, so students see one "Accelerated" option with both codes instead of two identical ones.
 */
export function mergeSameLevel(sections: Section[]): Option[] {
  const out: Option[] = [];
  for (const s of sections) {
    const same = out.find((o) => o.level === s.level && o.track === s.track && o.term === s.term && o.name === s.name);
    if (same) same.codes.push(s.code);
    else out.push({ ...s, codes: [s.code] });
  }
  return out;
}

/** Subject tone index: one burgundy shade per department. */
export const departmentTone = (department: string) => Math.max(0, DEPARTMENTS.indexOf(department as never)) % 4;

/** Picked classes: catalog course id → section code ("" until a level is chosen). */
export type Picks = Record<string, string>;
