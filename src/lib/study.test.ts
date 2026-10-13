import { describe, expect, it } from "vitest";
import { applyFactCheck, factCheckBlocks, validSummary, validTerms, type FactCheckOut } from "../../supabase/functions/_lib/study";

describe("fact-check", () => {
  it("builds one block per item, with only the pages it cites", () => {
    const pageText = new Map([[1, "Mitochondria make ATP."], [2, "The cell wall is rigid."]]);
    const out = factCheckBlocks([{ claim: "Q: What makes ATP?", pages: [1] }, { claim: "Q: No page", pages: [9] }], pageText, "page");
    expect(out).toContain("Item 0:\nClaim: Q: What makes ATP?\nCited page(s):\nMitochondria make ATP.");
    expect(out).toContain("Item 1:\nClaim: Q: No page\n(no page cited)");
  });

  it("drops items marked unsupported and attaches the quote to the rest", () => {
    const items = [{ front: "a" }, { front: "b" }, { front: "c" }];
    const out: FactCheckOut = { results: [{ index: 0, supported: true, quote: "A is true." }, { index: 1, supported: false, quote: "" }, { index: 2, supported: true, quote: "C is true." }] };
    expect(applyFactCheck(items, out)).toEqual([
      { item: { front: "a" }, quote: "A is true." },
      { item: { front: "c" }, quote: "C is true." },
    ]);
  });

  it("keeps an item the model did not answer, unquoted, so a flaky call never empties a set", () => {
    const items = [{ front: "a" }, { front: "b" }];
    expect(applyFactCheck(items, { results: [{ index: 0, supported: true, quote: "Q." }] })).toEqual([
      { item: { front: "a" }, quote: "Q." },
      { item: { front: "b" }, quote: null },
    ]);
  });

  it("only drops an item the model explicitly marked unsupported", () => {
    const items = [{ front: "a" }];
    expect(applyFactCheck(items, { results: [{ index: 0, supported: false, quote: "" }] })).toEqual([]);
  });
});

describe("summary and key terms", () => {
  it("cleans the summary body and drops an empty one", () => {
    expect(validSummary({ body: " The French Revolution began in 1789.  " })).toBe("The French Revolution began in 1789.");
    expect(validSummary({ body: "" })).toBe("");
  });
  it("validates terms, drops duplicates and keeps only real pages", () => {
    const valid = new Set([1, 2]);
    const out = {
      terms: [
        { term: "Estates-General", definition: "The French legislative assembly.", pages: [1, 9] },
        { term: "estates-general", definition: "A duplicate, different case.", pages: [2] },
        { term: "", definition: "No term given.", pages: [1] },
      ],
    };
    expect(validTerms(out, valid)).toEqual([{ term: "Estates-General", definition: "The French legislative assembly.", pages: [1] }]);
  });
});
