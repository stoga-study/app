// Grades come from the graduation year, so they move up on their own each school year.
// A new school year starts on July 1.
export type Grade = 9 | 10 | 11 | 12;
export const GRADES: Grade[] = [9, 10, 11, 12];
export const GRADE_NAME: Record<Grade, string> = { 9: "Freshman", 10: "Sophomore", 11: "Junior", 12: "Senior" };

/** The calendar year in which the current school year ends (2026-27 → 2027). */
export function schoolYearEnd(now = new Date()): number {
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

/** The grade for a graduation year, or null outside 9th–12th grade (not started, or graduated). */
export function gradeFor(graduationYear: number | null | undefined, now = new Date()): Grade | null {
  if (!graduationYear) return null;
  const g = 12 - (graduationYear - schoolYearEnd(now));
  return g >= 9 && g <= 12 ? (g as Grade) : null;
}

export function graduationYearFor(grade: Grade, now = new Date()): number {
  return schoolYearEnd(now) + (12 - grade);
}

/** "Sophomore, Class of 2029" */
export function describeGrade(graduationYear: number, now = new Date()): string {
  const g = gradeFor(graduationYear, now);
  return g ? `${GRADE_NAME[g]}, Class of ${graduationYear}` : `Class of ${graduationYear}`;
}
