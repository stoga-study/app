import { describe, expect, it } from "vitest";
import { newestRecent, type Recent } from "./recent";

const r = (href: string, minsAgo: number): Recent => ({ kind: "file", href, label: href, at: Date.now() - minsAgo * 60_000 });

describe("continue where you left off", () => {
  it("offers the newer of this device and the other", () => {
    expect(newestRecent(r("/a", 10), r("/b", 5))?.href).toBe("/b");
    expect(newestRecent(r("/a", 1), r("/b", 5))?.href).toBe("/a");
    expect(newestRecent(null, r("/b", 5))?.href).toBe("/b");
    expect(newestRecent(r("/a", 5), null)?.href).toBe("/a");
  });
  it("ignores stale or odd profile values", () => {
    expect(newestRecent(null, r("/b", 8 * 24 * 60))).toBeNull();
    expect(newestRecent(null, { href: "https://evil.example", at: Date.now() })).toBeNull();
    expect(newestRecent(null, "nope")).toBeNull();
  });
});
