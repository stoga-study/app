import { describe, expect, it } from "vitest";
import { dueSurvey } from "./surveys";

const base = { today: "2026-10-19", joinedAt: "2026-10-15T10:00:00Z", pastTests: [] as { title: string; due_on: string }[], answered: new Set<string>() };

describe("optional surveys", () => {
  it("asks about the first week after 7 days, not before", () => {
    expect(dueSurvey(base)).toBeNull();
    expect(dueSurvey({ ...base, joinedAt: "2026-10-12T10:00:00Z" })?.id).toBe("week-one");
  });
  it("asks about a test 1 to 3 days after it, by name, ahead of the week survey", () => {
    const s = dueSurvey({ ...base, joinedAt: "2026-10-01T10:00:00Z", pastTests: [{ title: "Bio test", due_on: "2026-10-17" }] });
    expect(s?.id).toBe("first-test");
    expect(s?.title).toContain("Bio test");
    expect(dueSurvey({ ...base, pastTests: [{ title: "Old test", due_on: "2026-10-10" }] })).toBeNull();
    expect(dueSurvey({ ...base, pastTests: [{ title: "Today's test", due_on: "2026-10-19" }] })).toBeNull();
  });
  it("never repeats one that was answered or put off", () => {
    expect(dueSurvey({ ...base, joinedAt: "2026-10-01T10:00:00Z", answered: new Set(["week-one"]) })).toBeNull();
    expect(dueSurvey({ ...base, pastTests: [{ title: "Bio test", due_on: "2026-10-18" }], answered: new Set(["first-test"]) })).toBeNull();
  });
});
