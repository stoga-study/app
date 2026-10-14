import { describe, expect, it } from "vitest";
import { reconstructPage, type TextItem } from "./layout";

const line = (x: number, y: number, str: string, height = 12): TextItem => ({ x, y, height, str, hasEOL: true });

describe("reconstructPage", () => {
  it("returns an empty string for no items", () => {
    expect(reconstructPage([], 600)).toBe("");
  });

  it("keeps simple single-column text in its given order", () => {
    const items = [line(50, 700, "First line."), line(50, 680, "Second line."), line(50, 660, "Third line.")];
    expect(reconstructPage(items, 600)).toBe("First line.\nSecond line.\nThird line.");
  });

  it("marks a short, noticeably bigger line as a heading", () => {
    const items = [line(50, 700, "A Big Heading", 22), line(50, 670, "Regular body text follows.", 12), line(50, 650, "More body text.", 12)];
    expect(reconstructPage(items, 600)).toBe("## A Big Heading\nRegular body text follows.\nMore body text.");
  });

  it("does not call a long bigger line a heading (a pull-quote, not a title)", () => {
    const long = "x".repeat(90);
    const items = [line(50, 700, long, 22), line(50, 670, "Body one.", 12), line(50, 650, "Body two.", 12), line(50, 630, "Body three.", 12)];
    expect(reconstructPage(items, 600)).toBe(`${long}\nBody one.\nBody two.\nBody three.`);
  });

  it("reorders a clear two-column layout into left column then right column, top to bottom", () => {
    // pdf.js can hand these back interleaved by y across the whole page; a real gutter should fix it.
    const items = [
      line(50, 700, "Left 1"), line(320, 700, "Right 1"),
      line(50, 680, "Left 2"), line(320, 680, "Right 2"),
      line(50, 660, "Left 3"), line(320, 660, "Right 3"),
    ];
    expect(reconstructPage(items, 600)).toBe("Left 1\nLeft 2\nLeft 3\nRight 1\nRight 2\nRight 3");
  });

  it("still separates the columns when both rows of a pair sit on the exact same y (real pdf.js bug)", () => {
    // pdf.js's own hasEOL only looks at whether y is about to change to the NEXT item in stream order.
    // When a left-column line and the right-column line beside it share the same y, the item ending the
    // left line is followed by a same-y item (the right column), so pdf.js marks it hasEOL: false — a
    // naive hasEOL-based line join would merge "Left 1" and "Right 1" into one garbled line.
    const items: TextItem[] = [
      { x: 50, y: 700, height: 12, str: "Left 1", hasEOL: false }, { x: 320, y: 700, height: 12, str: "Right 1", hasEOL: true },
      { x: 50, y: 680, height: 12, str: "Left 2", hasEOL: false }, { x: 320, y: 680, height: 12, str: "Right 2", hasEOL: true },
      { x: 50, y: 660, height: 12, str: "Left 3", hasEOL: false }, { x: 320, y: 660, height: 12, str: "Right 3", hasEOL: true },
    ];
    expect(reconstructPage(items, 600)).toBe("Left 1\nLeft 2\nLeft 3\nRight 1\nRight 2\nRight 3");
  });

  it("does not split on a narrow, indentation-sized gap (not a real column gutter)", () => {
    const items = [
      line(50, 700, "Heading"), line(60, 680, "- bullet one"), line(50, 660, "paragraph text"),
      line(60, 640, "- bullet two"), line(50, 620, "more text"), line(55, 600, "closing line"),
    ];
    expect(reconstructPage(items, 600)).toBe(items.map((i) => i.str).join("\n"));
  });

  it("does not split too few lines even if they land far apart", () => {
    const items = [line(50, 700, "Left"), line(400, 700, "Right"), line(50, 680, "More")];
    expect(reconstructPage(items, 600)).toBe("Left\nRight\nMore");
  });

  it("joins items on the same line (no hasEOL) before splitting into columns", () => {
    const items: TextItem[] = [
      { x: 50, y: 700, height: 12, str: "Hello ", hasEOL: false },
      { x: 80, y: 700, height: 12, str: "world.", hasEOL: true },
    ];
    expect(reconstructPage(items, 600)).toBe("Hello world.");
  });
});
