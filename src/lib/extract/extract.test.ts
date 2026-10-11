import { describe, expect, it } from "vitest";
import { assemblePdf, ExtractError, extractPasted, kindOf, splitIntoParts, tidy } from "./index";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof ExtractError ? e.code : "other";
  }
  return null;
};

describe("file kinds", () => {
  it("recognises supported files by name or type", () => {
    expect(kindOf({ name: "Week 5.PDF", type: "" })).toBe("pdf");
    expect(kindOf({ name: "notes.docx", type: "" })).toBe("docx");
    expect(kindOf({ name: "old.doc", type: "" })).toBe("legacy_doc");
    expect(kindOf({ name: "notes.md", type: "" })).toBe("text");
    expect(kindOf({ name: "photo.heic", type: "image/heic" })).toBeNull();
  });
});

describe("tidy", () => {
  it("joins hyphenated breaks and collapses spaces", () => {
    expect(tidy("stan-\ndard   error\n\n\n\nnext")).toBe("standard error\n\nnext");
  });
});

describe("splitIntoParts", () => {
  it("keeps short text as one part", () => {
    expect(splitIntoParts("One paragraph.\n\nTwo.")).toEqual(["One paragraph.\n\nTwo."]);
  });
  it("breaks between paragraphs near the size", () => {
    const para = "x".repeat(600);
    const parts = splitIntoParts(Array(12).fill(para).join("\n\n"), 2000);
    expect(parts.length).toBe(4);
    expect(parts.every((p) => p.length <= 2000)).toBe(true);
  });
  it("splits one huge paragraph at sentence ends", () => {
    const text = "This is a sentence. ".repeat(500);
    const parts = splitIntoParts(text, 3000);
    expect(parts.every((p) => p.length <= 3000 && p.endsWith("."))).toBe(true);
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(text.trim());
  });
});

describe("PDF pages", () => {
  it("keeps real page numbers and skips blank pages", () => {
    const r = assemblePdf([
      "The standard error of the mean measures how much sample means vary from sample to sample.",
      "",
      "By the Central Limit Theorem, sampling distributions approach a normal shape as n grows.",
    ]);
    expect(r.pages.map((p) => p.page)).toEqual([1, 3]);
    expect(r.skippedPages).toBe(1);
  });
  it("calls an image-only PDF scanned", () => {
    expect(code(() => assemblePdf(["", " ", "", "ab"]))).toBe("scanned");
  });
  it("calls a single blank page empty", () => {
    expect(code(() => assemblePdf([""]))).toBe("empty");
  });
});

describe("pasted text", () => {
  it("rejects empty paste", () => {
    expect(code(() => extractPasted("   \n "))).toBe("empty");
  });
  it("numbers parts from 1", () => {
    expect(extractPasted("Hello there.").pages).toEqual([{ page: 1, text: "Hello there." }]);
  });
});
