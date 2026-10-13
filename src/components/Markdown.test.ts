import { describe, expect, it } from "vitest";
import { blocks } from "./Markdown";

describe("blocks", () => {
  it("keeps generated notes as before: paragraphs join lines, lists group", () => {
    expect(blocks("Intro line\nmore\n\n- a\n- b")).toEqual([
      { kind: "p", lines: ["Intro line", "more"] },
      { kind: "ul", lines: ["a", "b"] },
    ]);
  });
  it("reads headings, checklists and mixed blocks", () => {
    expect(blocks("## Causes\nDebt:\n- wars\n- [ ] Read p.4\n- [x] Cards\n1. first")).toEqual([
      { kind: "h", level: 2, text: "Causes" },
      { kind: "p", lines: ["Debt:"] },
      { kind: "ul", lines: ["wars"] },
      { kind: "check", items: [{ done: false, text: "Read p.4" }, { done: true, text: "Cards" }] },
      { kind: "ol", lines: ["first"] },
    ]);
  });
});
