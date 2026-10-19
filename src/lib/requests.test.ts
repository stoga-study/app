import { describe, expect, it } from "vitest";
import { boardView, type FeatureRequest } from "./queries/requests";

const r = (id: string, status: FeatureRequest["status"], votes: number, created_at: string): FeatureRequest => ({ id, title: id, body: "", status, note: null, votes, voted: false, mine: false, created_at });
const items = [r("a", "open", 3, "2026-10-01"), r("b", "open", 9, "2026-10-02"), r("c", "planned", 5, "2026-10-03"), r("d", "shipped", 20, "2026-09-01"), r("e", "declined", 1, "2026-10-04"), r("f", "review", 0, "2026-10-05")];

describe("ideas board", () => {
  it("most wanted: open, planned and building, by votes", () => expect(boardView(items, "top").map((x) => x.id)).toEqual(["b", "c", "a"]));
  it("new: newest first, same set", () => expect(boardView(items, "new").map((x) => x.id)).toEqual(["c", "b", "a"]));
  it("planned and shipped: planned first, then shipped", () => expect(boardView(items, "done").map((x) => x.id)).toEqual(["c", "d"]));
  it("never shows ones waiting for review or declined in the views", () => expect(["top", "new", "done"].flatMap((v) => boardView(items, v as "top").map((x) => x.id))).not.toContain("f"));
});
