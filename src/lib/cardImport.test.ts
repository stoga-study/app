import { describe, expect, it } from "vitest";
import { MAX_IMPORT, parseCardImport, parseDelimited } from "./cardImport";

describe("parseCardImport", () => {
  it("reads pasted term - definition lines, in several dash and colon styles", () => {
    const r = parseCardImport(["Mitosis - cell division", "Meiosis – makes gametes", "pH: how acidic something is", "1. ATP = energy currency", "- Self-esteem - how you see yourself"].join("\n"));
    expect(r.format).toBe("lines");
    expect(r.cards).toEqual([
      { front: "Mitosis", back: "cell division" },
      { front: "Meiosis", back: "makes gametes" },
      { front: "pH", back: "how acidic something is" },
      { front: "ATP", back: "energy currency" },
      { front: "Self-esteem", back: "how you see yourself" },
    ]);
  });

  it("counts lines it cannot split instead of guessing", () => {
    const r = parseCardImport("Mitosis - cell division\njust a heading\n\nMeiosis - gametes");
    expect(r.cards).toHaveLength(2);
    expect(r.skipped).toBe(1);
  });

  it("reads Quizlet's default export (tab between term and definition, one card per line)", () => {
    const r = parseCardImport("photosynthesis\tturning light into sugar\nchlorophyll\tthe green pigment");
    expect(r.format).toBe("tabs");
    expect(r.cards).toEqual([{ front: "photosynthesis", back: "turning light into sugar" }, { front: "chlorophyll", back: "the green pigment" }]);
  });

  it("reads an Anki text export: skips # headers, strips HTML, ignores extra columns like tags", () => {
    const text = "#separator:tab\n#html:true\n#tags column:3\nWhat is <b>ATP</b>?\tEnergy<br>currency\tbio unit4\nKrebs cycle&nbsp;site\tmitochondrial matrix\tbio";
    const r = parseCardImport(text);
    expect(r.format).toBe("anki");
    expect(r.cards).toEqual([{ front: "What is ATP?", back: "Energy\ncurrency" }, { front: "Krebs cycle site", back: "mitochondrial matrix" }]);
  });

  it("reads CSV with a header row and quoted fields holding commas, quotes and newlines", () => {
    const text = 'term,definition\n"Osmosis","water moving, through a membrane"\n"Quote","He said ""hi""\nthen left"\nDiffusion,spreading out';
    const r = parseCardImport(text, "cards.csv");
    expect(r.format).toBe("csv");
    expect(r.cards).toEqual([
      { front: "Osmosis", back: "water moving, through a membrane" },
      { front: "Quote", back: 'He said "hi"\nthen left' },
      { front: "Diffusion", back: "spreading out" },
    ]);
  });

  it("does not take a dash line with commas in its definition for CSV", () => {
    const r = parseCardImport("Mitosis - cell division, makes two cells\nMeiosis - four cells, half the chromosomes");
    expect(r.format).toBe("lines");
    expect(r.cards[0]).toEqual({ front: "Mitosis", back: "cell division, makes two cells" });
  });

  it("caps one import at the limit and counts the rest as skipped", () => {
    const text = Array.from({ length: MAX_IMPORT + 5 }, (_, i) => `t${i}\td${i}`).join("\n");
    const r = parseCardImport(text);
    expect(r.cards).toHaveLength(MAX_IMPORT);
    expect(r.skipped).toBe(5);
  });

  it("handles an empty paste and a byte-order mark", () => {
    expect(parseCardImport("   \n ").cards).toEqual([]);
    expect(parseCardImport("\uFEFFa\tb").cards).toEqual([{ front: "a", back: "b" }]);
  });
});

describe("parseDelimited", () => {
  it("handles CRLF line endings", () => {
    expect(parseDelimited("a,b\r\nc,d\r\n", ",")).toEqual([["a", "b"], ["c", "d"]]);
  });
});
