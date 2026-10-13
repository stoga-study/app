import { describe, expect, it } from "vitest";
import { addTag, groupCards, matchCard, normTag, parseTags, removeTag, tagCounts } from "./cardsOrg";

describe("tags", () => {
  it("cleans tags", () => {
    expect(normTag("  #Key   Terms ")).toBe("key terms");
    expect(normTag("##")).toBeNull();
    expect(normTag("x".repeat(40))).toHaveLength(30);
    expect(parseTags("vocab, #Unit 3,, vocab ,  ")).toEqual(["vocab", "unit 3"]);
    expect(addTag(["a"], "a")).toEqual(["a"]);
    expect(addTag(["a"], "b")).toEqual(["a", "b"]);
    expect(removeTag(["a", "b"], "a")).toEqual(["b"]);
    expect(tagCounts([{ tags: ["b", "a"] }, { tags: ["a"] }])).toEqual([["a", 2], ["b", 1]]);
  });
});

describe("search", () => {
  const card = { front: "What did the Estates-General do?", back: "Met in 1789", tags: ["vocab", "unit 11"] };
  it("matches words and tags", () => {
    expect(matchCard(card, "estates 1789")).toBe(true);
    expect(matchCard(card, "estates 1790")).toBe(false);
    expect(matchCard(card, "#voc")).toBe(true);
    expect(matchCard(card, "#dates")).toBe(false);
    expect(matchCard(card, "unit")).toBe(true);
    expect(matchCard(card, "  ")).toBe(true);
  });
});

describe("grouping", () => {
  const src = (id: string, unit: string | null, lesson: string | null, subject = "S") => ({ id, subject_id: subject, filename: id, unit_id: unit, lesson, created_at: "2026-10-01" });
  it("orders units, then unfiled files, then your own cards", () => {
    const sources = [src("f11b", "u11", "11.2"), src("f11a", "u11", "11.1"), src("f10", "u10", null), src("loose-file", null, null), src("other", null, null, "T")];
    const units = [{ id: "u11", number: "11", title: "French Revolution" }, { id: "u10", number: "10", title: null }];
    const cards = [
      { id: "1", source_id: "f11b" }, { id: "2", source_id: "f11a" }, { id: "3", source_id: "f10" },
      { id: "4", source_id: "loose-file" }, { id: "5", source_id: null }, { id: "6", source_id: "other" },
    ];
    const g = groupCards(cards, sources, units, "S");
    expect(g.map((x) => x.title)).toEqual(["Unit 10", "Unit 11 · French Revolution", "No unit", "Your own cards"]);
    expect(g[1].files.map((f) => f.key)).toEqual(["f11a", "f11b"]);
    expect(g[3].files[0].cards.map((c) => c.id)).toEqual(["5", "6"]);
  });
});
