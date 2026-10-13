import { describe, expect, it } from "vitest";
import { byNumber, findUnit, unitName } from "./units";

describe("findUnit", () => {
  it("reads unit and lesson numbers from file names", () => {
    expect(findUnit("Unit 11.1 notes world history.pdf")).toMatchObject({ number: "11", lesson: "11.1" });
    expect(findUnit("11.1 notes world history.pdf")).toBeNull();
    expect(findUnit("U2L6 + U2L7 Exponential Functions.pdf")).toMatchObject({ number: "2", lesson: "2.6", title: "Exponential Functions" });
    expect(findUnit("Unit 3 & 4 Review Packet.pdf")).toMatchObject({ number: "3", title: "Review Packet" });
    expect(findUnit("Chapter 7 - Cell Respiration.pdf")).toEqual({ number: "7", lesson: null, title: "Cell Respiration", word: "Chapter" });
    expect(findUnit("Ch.7 review.docx")).toMatchObject({ number: "7", word: "Chapter", title: null });
    expect(findUnit("ch12_stoichiometry.pdf")).toMatchObject({ number: "12", title: "stoichiometry" });
    expect(findUnit("Module 3 Quadratics.pptx")).toMatchObject({ number: "3", word: "Module", title: "Quadratics" });
    expect(findUnit("U2L6+Notes+Equations+with+Radicals.pdf")).toMatchObject({ number: "2", lesson: "2.6", title: "Equations with Radicals" });
    expect(findUnit("Lesson 5.2 Graphing.pdf")).toMatchObject({ number: "5", lesson: "5.2", title: "Graphing" });
  });
  it("falls back to the first page", () => {
    expect(findUnit("scan_0034.pdf", "Unit 11: The French Revolution (1789–1799)\nCauses …")).toEqual({
      number: "11", lesson: null, title: "The French Revolution (1789–1799)", word: "Unit",
    });
  });
  it("does not guess without a clear label", () => {
    expect(findUnit("Week 5 Sampling.pdf", "AP Statistics. A sampling distribution is…")).toBeNull();
    expect(findUnit("Lesson 6 notes.pdf")).toBeNull();
    expect(findUnit("community unity essay.docx")).toBeNull();
  });
});

describe("unitName and order", () => {
  it("shows units plainly and sorts them in teaching order", () => {
    expect(unitName({ number: "11", title: "The French Revolution" })).toBe("Unit 11 · The French Revolution");
    expect(unitName({ number: "7", title: null, word: "Chapter" })).toBe("Chapter 7");
    expect(unitName({ number: null, title: "Poetry" })).toBe("Poetry");
    const units = [{ number: "11", title: "a" }, { number: null, title: "Poetry" }, { number: "2", title: "b" }];
    expect(units.sort(byNumber).map((u) => u.number ?? u.title)).toEqual(["2", "11", "Poetry"]);
  });
});
