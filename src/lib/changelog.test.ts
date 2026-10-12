import { describe, expect, it } from "vitest";
import { compareVersions, unseen, type Release } from "./changelog";

const r = (version: string): Release => ({ version, date: "", title: "", highlights: [] });

describe("changelog", () => {
  it("orders versions numerically", () => {
    expect(compareVersions("1.10.0", "1.9.3")).toBeGreaterThan(0);
    expect(compareVersions("1.1.0", "1.1.0")).toBe(0);
    expect(compareVersions("1.1", "1.1.1")).toBeLessThan(0);
  });
  it("shows only releases newer than the last one seen, and nothing to brand-new students", () => {
    const all = [r("1.1.1"), r("1.1.0"), r("1.0.0")];
    expect(unseen(all, "1.0.0").map((x) => x.version)).toEqual(["1.1.1", "1.1.0"]);
    expect(unseen(all, "1.1.1")).toEqual([]);
    expect(unseen(all, null)).toEqual([]);
  });
});
