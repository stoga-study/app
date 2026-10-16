import { describe, expect, it } from "vitest";
import { choiceKey, isTyping } from "./shortcuts";

describe("shortcuts", () => {
  it("maps answer keys to options", () => {
    expect(choiceKey("a", 4)).toBe(0);
    expect(choiceKey("D", 4)).toBe(3);
    expect(choiceKey("3", 4)).toBe(2);
    expect(choiceKey("d", 3)).toBeNull();
    expect(choiceKey("e", 4)).toBeNull();
    expect(choiceKey("Enter", 4)).toBeNull();
  });
  it("stays out of the way while typing", () => {
    const el = (match: boolean) => ({ closest: () => (match ? {} : null) }) as unknown as EventTarget;
    expect(isTyping(el(true))).toBe(true);
    expect(isTyping(el(false))).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});
