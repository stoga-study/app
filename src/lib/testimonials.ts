// How a testimonial names its author, fixed when it's shared. Pure, unit tested.
export type Display = "name_grade" | "grade" | "anonymous";
const ORD: Record<number, string> = { 9: "9th", 10: "10th", 11: "11th", 12: "12th" };

export function displayName(d: Display, firstName: string | null | undefined, grade: number | null | undefined) {
  const first = (firstName ?? "").trim().split(/\s+/)[0]?.slice(0, 30) ?? "";
  const g = grade && ORD[grade];
  if (d === "name_grade" && first) return g ? `${first}, ${g} grade` : first;
  // "An 11th grader": eleventh starts with a vowel sound.
  if (d === "grade" || (d === "name_grade" && !first)) return g ? `${grade === 11 ? "An" : "A"} ${g} grader at Conestoga` : "A Conestoga student";
  return "A Conestoga student";
}
