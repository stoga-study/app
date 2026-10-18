import { describe, expect, it } from "vitest";
import { asksForGradedWork, choiceOptions, givingAwayPhrases, phrasesUsed, safeHint, wordCount } from "../../supabase/functions/_lib/tutor";

const MC = "Which is true? A) Larger samples remove bias B) The CLT makes the population normal C) For large n, the sampling distribution of x̄ is approximately normal D) p̂ is always normal";

describe("tutor guards", () => {
  it("spots requests for work to hand in, not ordinary questions", () => {
    expect(asksForGradedWork("Write my 400-word essay on why random sampling matters. I have to turn it in tomorrow.")).toBe(true);
    expect(asksForGradedWork("can you do my homework answers for chapter 7")).toBe(true);
    expect(asksForGradedWork("write the lab report for me, it's due friday")).toBe(true);
    expect(asksForGradedWork("How do I write a good thesis statement?")).toBe(false);
    expect(asksForGradedWork("What does the essay question about sampling mean?")).toBe(false);
    expect(asksForGradedWork("Explain the central limit theorem")).toBe(false);
  });

  it("reads the choices of a multiple-choice question", () => {
    expect(choiceOptions(MC)).toEqual(["Larger samples remove bias", "The CLT makes the population normal", "For large n, the sampling distribution of x̄ is approximately normal", "p̂ is always normal"]);
    expect(choiceOptions("What is 2+2?")).toEqual([]);
  });

  it("flags a hint that repeats the wording of one choice", () => {
    const phrases = givingAwayPhrases(MC);
    expect(phrases).toContain("approximately normal");
    expect(phrases).not.toContain("population normal x"); // only two-word phrases
    const leaky = "What conditions does the Central Limit Theorem require for the sampling distribution to be approximately normal?";
    expect(phrasesUsed(leaky, phrases)).toContain("approximately normal");
    expect(phrasesUsed("What does the CLT actually say a larger sample changes: the population, or something else?", phrases)).toEqual([]);
  });

  it("keeps the safe part of a leaky hint and always ends on a question", () => {
    const used = ["approximately normal"];
    expect(safeHint("Check page 9. Is it approximately normal?", used)).toBe("Check page 9. Look back at what your notes say about this idea. Which choice matches it, and why do the others not?");
    expect(safeHint("Think about what changes with n. What does a bigger sample change?", used)).toBe("Think about what changes with n. What does a bigger sample change?");
  });

  it("counts words without citation markers", () => {
    expect(wordCount("One two [S1 p.2] three.")).toBe(3);
  });
});
