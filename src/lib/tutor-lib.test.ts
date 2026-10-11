import { describe, expect, it } from "vitest";
import { checkCitations, guessMode, houseStyle, normalizeCitations, searchTerms, systemPrompt, userTurn, type Src } from "../../supabase/functions/_lib/tutor";
import { citesNotes, displayText } from "./tutor";

const sources: Src[] = [{ key: "S1", source_id: "a", filename: "Week 5.pdf", kind: "pdf", pages: [4, 7] }];

describe("guessMode (fallback routing)", () => {
  it("treats greetings and thanks as chat", () => {
    expect(guessMode("Hi")).toBe("chat");
    expect(guessMode("thanks, that helped")).toBe("chat");
    expect(guessMode("I don't get #4")).toBe("chat");
  });
  it("spots problems, including multiple choice", () => {
    expect(guessMode("A population has σ = 15. For samples of n = 25, what is the standard error?")).toBe("hint");
    expect(guessMode("Which is true? A) bias B) normal C) spread D) none")).toBe("hint");
  });
  it("spots an attempt only after a hint", () => {
    expect(guessMode("is it 15/25 = 0.6?", "hint")).toBe("check");
    expect(guessMode("0.6?", "check")).toBe("check");
    expect(guessMode("is it 15/25 = 0.6?", "explain")).toBe("hint");
  });
  it("defaults to explain", () => {
    expect(guessMode("What is the Central Limit Theorem?")).toBe("explain");
  });
});

describe("citations", () => {
  it("rewrites gpt-oss style citations", () => {
    expect(normalizeCitations("SE = σ/√n【S1 p.7】 and 【S2†p.3】.")).toBe("SE = σ/√n[S1 p.7] and [S2 p.3].");
    expect(normalizeCitations("See 【turn0search1】 here")).toBe("See  here");
  });
  it("keeps real pages and drops invented ones", () => {
    const { cleaned, used } = checkCitations("SE = σ/√n【S1 p.7】. Also see [S1 p.9] and [S2 p.1].", sources);
    expect(cleaned).toBe("SE = σ/√n [S1 p.7]. Also see and.");
    expect(used).toEqual([{ key: "S1", source_id: "a", filename: "Week 5.pdf", kind: "pdf", page: 7 }]);
  });
  it("removes the old general-knowledge opener", () => {
    expect(checkCitations("Your sources don't cover this. Here's general knowledge: Plants use light.", []).cleaned).toBe("Plants use light.");
  });
  it("shows streamed citations cleanly in the app", () => {
    expect(displayText("the formula【S1 p.7】 then【S1 p")).toBe("the formula[S1 p.7] then");
    expect(citesNotes("as your notes say【S1 p.7】")).toBe(true);
    expect(citesNotes("Plants use light.")).toBe(false);
  });
});

describe("houseStyle", () => {
  it("drops exclamation marks but keeps factorials", () => {
    expect(houseStyle("Hi! Great question!")).toBe("Hi. Great question.");
    expect(houseStyle("There are 5! = 120 orders.")).toBe("There are 5! = 120 orders.");
  });
});

describe("searchTerms", () => {
  it("drops filler words", () => {
    expect(searchTerms("Hi")).toEqual([]);
    expect(searchTerms("How do I check the Large Counts condition?")).toEqual(["check", "large", "counts", "condition"]);
  });
  it("borrows the previous question for short follow-ups", () => {
    expect(searchTerms("why does that matter?", "What is the Central Limit Theorem?")).toEqual(["matter", "central", "limit", "theorem"]);
    expect(searchTerms("standard error of sample means with sigma 12", "unrelated earlier topic")).not.toContain("unrelated");
  });
});

describe("prompts", () => {
  const base = { className: "AP Statistics", level: 1 as const, hasSources: true, topics: ["Sampling distributions"] };
  it("gives each mode only its own task", () => {
    expect(systemPrompt({ ...base, mode: "chat" })).toContain("never invent a problem");
    expect(systemPrompt({ ...base, mode: "chat" })).not.toContain("HINT 1 of 3");
    expect(systemPrompt({ ...base, mode: "hint", level: 2 })).toContain("HINT 2 of 3");
    expect(systemPrompt({ ...base, mode: "check" })).toContain("whether it is right");
  });
  it("asks for the next ladder step without repeating the attempt", () => {
    expect(userTurn([], "is it 0.6?", 3)).toContain("the full explanation for the problem");
    expect(userTurn([], "is it 0.6?", 3)).not.toContain("0.6");
  });
});
