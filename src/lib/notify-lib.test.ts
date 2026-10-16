import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, eveningMessage, inWindow, isQuiet, localNow, minutesOf, toPrefs } from "../../supabase/functions/_lib/notify";

describe("notification rules", () => {
  it("reads settings safely", () => {
    expect(toPrefs(null)).toEqual(DEFAULT_PREFS);
    expect(toPrefs({ study: false, time: "20:15", tz: "Europe/London", quiet_start: "nope" })).toMatchObject({ study: false, time: "20:15", tz: "Europe/London", quiet_start: "21:30" });
    expect(toPrefs({ tz: "Mars/Olympus" }).tz).toBe("America/New_York");
  });

  it("knows the student's local day and time, and when their day began", () => {
    // 2026-10-16 01:30 UTC is 21:30 on Oct 15 in New York (EDT, UTC-4).
    const l = localNow("America/New_York", new Date("2026-10-16T01:30:00Z"));
    expect(l).toMatchObject({ date: "2026-10-15", minutes: 21 * 60 + 30 });
    expect(l.dayStart.toISOString()).toBe("2026-10-15T04:00:00.000Z");
    expect(localNow("Asia/Kolkata", new Date("2026-10-15T20:00:00Z"))).toMatchObject({ date: "2026-10-16", minutes: 90 });
  });

  it("sends in the 15 minutes after the chosen time, and never in quiet hours", () => {
    expect(inWindow(minutesOf("19:05"), minutesOf("19:00"))).toBe(true);
    expect(inWindow(minutesOf("19:15"), minutesOf("19:00"))).toBe(false);
    expect(inWindow(minutesOf("00:05"), minutesOf("23:55"))).toBe(true);
    expect(isQuiet(minutesOf("22:00"), minutesOf("21:30"), minutesOf("07:30"))).toBe(true);
    expect(isQuiet(minutesOf("06:00"), minutesOf("21:30"), minutesOf("07:30"))).toBe(true);
    expect(isQuiet(minutesOf("19:00"), minutesOf("21:30"), minutesOf("07:30"))).toBe(false);
    expect(isQuiet(minutesOf("13:00"), minutesOf("12:00"), minutesOf("14:00"))).toBe(true);
  });

  const base = { firstName: "Sam", coachName: "Juno", due: 12, testTomorrow: null, testSoon: null, studiedToday: false, daysSinceStudy: 1, worstScoreToday: null, sent: {}, prefs: DEFAULT_PREFS };

  it("picks one message: a test tomorrow first, then due cards if nothing was studied", () => {
    expect(eveningMessage(base)).toMatchObject({ kind: "study", title: "Sam, 12 cards ready", url: "/review/session?size=10" });
    expect(eveningMessage({ ...base, studiedToday: true })).toBeNull();
    expect(eveningMessage({ ...base, due: 0 })).toBeNull();
    expect(eveningMessage({ ...base, testTomorrow: { id: "e1", title: "Bio test" } })).toMatchObject({ kind: "test", title: "Bio test is tomorrow", url: "/exam/e1" });
    expect(eveningMessage({ ...base, testTomorrow: { id: "e1", title: "Bio test" }, prefs: { ...DEFAULT_PREFS, tests: false } })?.kind).toBe("study");
  });

  it("checks in after a rough quiz, from the coach by name, rotating the wording", () => {
    const m = eveningMessage({ ...base, studiedToday: true, worstScoreToday: 45 });
    expect(m).toMatchObject({ kind: "rough", variant: 0, title: "Juno: tough quiz today?" });
    expect(eveningMessage({ ...base, studiedToday: true, worstScoreToday: 45, sent: { rough: { daysAgo: 3, variant: 0 } } })?.variant).toBe(1);
    expect(eveningMessage({ ...base, studiedToday: true, worstScoreToday: 45, sent: { rough: { daysAgo: 3, variant: 2 } } })?.variant).toBe(0);
    expect(eveningMessage({ ...base, studiedToday: true, worstScoreToday: 75 })).toBeNull();
  });

  it("nudges a comeback only when a test is close, after 2+ quiet days, at most weekly", () => {
    const soon = { id: "e2", title: "Bio test", when: "Friday" };
    expect(eveningMessage({ ...base, testSoon: soon, daysSinceStudy: 3 })).toMatchObject({ kind: "comeback", title: "Your Bio test is Friday", body: "10 minutes tonight?", url: "/exam/e2" });
    expect(eveningMessage({ ...base, testSoon: soon, daysSinceStudy: 1 })?.kind).toBe("study");
    expect(eveningMessage({ ...base, testSoon: soon, daysSinceStudy: 3, sent: { comeback: { daysAgo: 2, variant: 0 } } })?.kind).toBe("study");
  });

  it("checks in quietly after 4+ days with nothing coming up, and respects the switch", () => {
    expect(eveningMessage({ ...base, due: 0, daysSinceStudy: 5 })).toMatchObject({ kind: "quiet", title: "Juno: haven't seen you in a few days", url: "/coach" });
    expect(eveningMessage({ ...base, due: 0, daysSinceStudy: 5, sent: { quiet: { daysAgo: 3, variant: 0 } } })).toBeNull();
    expect(eveningMessage({ ...base, due: 0, daysSinceStudy: 5, prefs: { ...DEFAULT_PREFS, checkins: false } })).toBeNull();
    expect(eveningMessage({ ...base, due: 0, daysSinceStudy: null })).toBeNull();
  });
});
