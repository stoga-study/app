import { describe, expect, it } from "vitest";
import { prettyFilename, TITLE_MAX } from "./filename";

describe("prettyFilename", () => {
  it("cleans the U2L6 lesson notes", () => {
    const t = prettyFilename("U2L6+Notes+Equations+with+Radicals+and+Rational+Exponents+ANSWERS.pdf");
    expect(t.startsWith("Lesson 6: Equations with Radicals")).toBe(true);
    expect(t.endsWith("(Answers)")).toBe(true);
    expect(t.length).toBeLessThanOrEqual(TITLE_MAX);
  });
  it("keeps short names whole", () => {
    expect(prettyFilename("U2L6_notes_radicals.pdf")).toBe("Unit 2, Lesson 6: Radicals");
    expect(prettyFilename("Week5Sampling.pdf")).toBe("Week 5: Sampling");
    expect(prettyFilename("ch3-photosynthesis.docx")).toBe("Chapter 3: Photosynthesis");
  });
  it("fixes casing but keeps acronyms", () => {
    expect(prettyFilename("AP_BIO_CELL_RESPIRATION_ATP.pdf")).toBe("AP Bio Cell Respiration ATP");
    expect(prettyFilename("the great gatsby ch 1 notes.pdf")).toBe("The Great Gatsby Chapter 1 Notes");
    expect(prettyFilename("WWII%20causes%20and%20effects.pdf")).toBe("WWII Causes and Effects");
  });
  it("knows school shorthand", () => {
    expect(prettyFilename("APUSH_Period_3_Notes_FINAL.pdf")).toBe("APUSH Period 3 Notes");
    expect(prettyFilename("The%20Crucible%20Act%201%20Study%20Guide.pdf")).toBe("The Crucible Act 1 Study Guide");
  });
  it("removes clutter", () => {
    expect(prettyFilename("Copy of Unit 4 Review (1).pdf")).toBe("Unit 4: Review");
    expect(prettyFilename("HW 7 answer key.pdf")).toBe("Homework 7 (Answers)");
  });
  it("never returns an empty title", () => {
    expect(prettyFilename("___.pdf")).toBe("Untitled notes");
  });
});
