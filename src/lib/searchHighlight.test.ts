import { describe, expect, it } from "vitest";
import { highlightParts } from "./searchHighlight";

describe("highlightParts", () => {
  it("splits plain text around <b> matches", () => {
    expect(highlightParts("The <b>Estates</b>-General met in 1789")).toEqual([
      { text: "The ", mark: false },
      { text: "Estates", mark: true },
      { text: "-General met in 1789", mark: false },
    ]);
  });
  it("handles more than one match", () => {
    expect(highlightParts("<b>A</b> and <b>B</b>")).toEqual([
      { text: "A", mark: true },
      { text: " and ", mark: false },
      { text: "B", mark: true },
    ]);
  });
  it("returns the whole text unmarked when there is no match", () => {
    expect(highlightParts("no markers here")).toEqual([{ text: "no markers here", mark: false }]);
  });
  it("handles an empty string", () => {
    expect(highlightParts("")).toEqual([]);
  });
});
