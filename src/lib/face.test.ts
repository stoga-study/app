import { describe, expect, it } from "vitest";
import { DEFAULT_COACH_FACE, faceFor, PARTS, randomFace, seeded, toCoach, toFace, type Part } from "./face";

describe("faces", () => {
  it("keeps known choices and falls back for the rest", () => {
    const f = toFace({ hair: "afro", eyes: "lasers", bg: 42, junk: "x" });
    expect(f.hair).toBe("afro");
    expect(f.eyes).toBe(DEFAULT_COACH_FACE.eyes);
    expect(f.bg).toBe(DEFAULT_COACH_FACE.bg);
    expect(f).not.toHaveProperty("junk");
    expect(toFace(null)).toEqual(DEFAULT_COACH_FACE);
  });

  it("makes only valid random faces", () => {
    const rand = seeded("test");
    for (let i = 0; i < 200; i++) {
      const f = randomFace(rand);
      for (const k of Object.keys(PARTS) as Part[]) expect(PARTS[k]).toContain(f[k]);
      if (f.extra === "sunglasses") expect(f.brows).toBe("none");
    }
  });

  it("gives an account the same starting face every time", () => {
    expect(faceFor("user-1")).toEqual(faceFor("user-1"));
    expect(faceFor("user-1")).not.toEqual(faceFor("user-2"));
  });

  it("reads coach settings safely", () => {
    expect(toCoach({ name: "  Juno   the  great ", vibe: "hype", length: "short" })).toMatchObject({ name: "Juno the great", vibe: "hype", length: "short" });
    expect(toCoach({ name: "x".repeat(50) }).name).toHaveLength(24);
    expect(toCoach({ name: "", vibe: "evil", length: 3 })).toMatchObject({ name: "Coach", vibe: "chill", length: "normal" });
  });
});
