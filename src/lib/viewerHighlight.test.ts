import { describe, expect, it } from "vitest";
import { highlightQuote } from "./viewerHighlight";

describe("highlightQuote", () => {
  it("splits around a matching quote, case-insensitively", () => {
    expect(highlightQuote("The Estates-General met in May 1789.", "estates-general")).toEqual([
      { text: "The ", mark: false },
      { text: "Estates-General", mark: true },
      { text: " met in May 1789.", mark: false },
    ]);
  });
  it("returns the whole text unmarked when there is no quote", () => {
    expect(highlightQuote("Some page text.", null)).toEqual([{ text: "Some page text.", mark: false }]);
    expect(highlightQuote("Some page text.", "")).toEqual([{ text: "Some page text.", mark: false }]);
  });
  it("returns the whole text unmarked when the quote is not found", () => {
    expect(highlightQuote("Some page text.", "not here")).toEqual([{ text: "Some page text.", mark: false }]);
  });
  it("handles a quote at the very start or end", () => {
    expect(highlightQuote("Start of it", "Start")).toEqual([{ text: "Start", mark: true }, { text: " of it", mark: false }]);
    expect(highlightQuote("end of it", "it")).toEqual([{ text: "end of ", mark: false }, { text: "it", mark: true }]);
  });
});
