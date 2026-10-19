import { describe, expect, it } from "vitest";
import { displayName } from "./testimonials";

describe("testimonial names", () => {
  it("first name and grade, grade only, or anonymous", () => {
    expect(displayName("name_grade", "Maya Chen", 10)).toBe("Maya, 10th grade");
    expect(displayName("grade", "Maya", 10)).toBe("A 10th grader at Conestoga");
    expect(displayName("anonymous", "Maya", 10)).toBe("A Conestoga student");
  });
  it("never shows a surname, and copes with missing details", () => {
    expect(displayName("name_grade", "  Maya Chen  ", null)).toBe("Maya");
    expect(displayName("name_grade", "", 11)).toBe("An 11th grader at Conestoga");
    expect(displayName("grade", null, null)).toBe("A Conestoga student");
  });
});
