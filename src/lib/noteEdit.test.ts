import { describe, expect, it } from "vitest";
import { insert, notePreview, noteTitle, toggleCheck, toggleLines, wrap } from "./noteEdit";

describe("toolbar edits", () => {
  it("bolds and unbolds the selection", () => {
    const on = wrap({ text: "the Estates-General met", start: 4, end: 19 });
    expect(on).toEqual({ text: "the **Estates-General** met", start: 6, end: 21 });
    expect(wrap(on)).toEqual({ text: "the Estates-General met", start: 4, end: 19 });
    expect(wrap({ text: "a **b** c", start: 2, end: 7 }).text).toBe("a b c");
    expect(wrap({ text: "ab", start: 1, end: 1 })).toEqual({ text: "a****b", start: 3, end: 3 });
  });
  it("toggles a prefix on every selected line", () => {
    const t = "Causes\nDebt\nBad harvests";
    const on = toggleLines({ text: t, start: 8, end: 20 }, "- ");
    expect(on.text).toBe("Causes\n- Debt\n- Bad harvests");
    expect(toggleLines({ text: on.text, start: 9, end: 25 }, "- ").text).toBe(t);
    // One list kind replaces another, and headings work on the cursor's line.
    expect(toggleLines({ text: "- Debt", start: 3, end: 3 }, "- [ ] ").text).toBe("- [ ] Debt");
    expect(toggleLines({ text: "a\nCauses", start: 4, end: 4 }, "## ")).toEqual({ text: "a\n## Causes", start: 7, end: 7 });
  });
  it("inserts symbols over the selection", () => {
    expect(insert({ text: "x  = 5", start: 1, end: 1 }, "̄")).toEqual({ text: "x̄  = 5", start: 2, end: 2 });
  });
  it("ticks the nth checklist item", () => {
    const t = "- [ ] Read p.4\ntext\n- [x] Make cards\n- [ ] Quiz";
    expect(toggleCheck(t, 0)).toBe("- [x] Read p.4\ntext\n- [x] Make cards\n- [ ] Quiz");
    expect(toggleCheck(t, 1)).toBe("- [ ] Read p.4\ntext\n- [ ] Make cards\n- [ ] Quiz");
  });
});

describe("titles and previews", () => {
  it("falls back to the first line", () => {
    expect(noteTitle({ title: " Week 3 ", body: "x" })).toBe("Week 3");
    expect(noteTitle({ title: "", body: "\n## **Causes** of 1789\nmore" })).toBe("Causes of 1789");
    expect(noteTitle({ title: "", body: "  " })).toBe("Untitled note");
    expect(notePreview("## Causes\n- [ ] Debt\n- **Bread** prices", 18)).toBe("Causes Debt Bread…");
  });
});
