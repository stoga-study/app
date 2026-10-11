import data from "@/data/chs-courses.json";
import type { Grade } from "./grade";

// Core classes from the Conestoga High School Program of Studies.
// Rebuilt with scripts/program-of-studies when a new edition comes out.
export type Level = "AP" | "H*" | "H" | "X" | "A";
export type Section = { code: string; level: Level | null; name: string; grades: number[]; approvalGrades: number[] };
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
type Catalog = { school: string; schoolYear: string; source: string; courses: Course[] };

export const catalog = data as Catalog;
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

/** Subject tone index: one burgundy shade per department. */
export const departmentTone = (department: string) => Math.max(0, DEPARTMENTS.indexOf(department as never)) % 4;

/** Picked classes: catalog course id → section code ("" until a level is chosen). */
export type Picks = Record<string, string>;
