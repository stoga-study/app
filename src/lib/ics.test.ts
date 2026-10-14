import { describe, expect, it } from "vitest";
import { calendarName, guessClass, guessKind, parseIcs, parseWhen } from "./ics";
import { safeFeedUrl } from "../../supabase/functions/_lib/url";

const ICS = [
  "BEGIN:VCALENDAR",
  "X-WR-CALNAME:Schoology: Tredyffrin",
  "BEGIN:VEVENT",
  "UID:abc-1@schoology",
  "DTSTART;VALUE=DATE:20261016",
  "SUMMARY:Unit 4 Test\\, Cells",
  "DESCRIPTION:Bring a pencil.\\nAP Biology",
  "BEGIN:VALARM",
  "DESCRIPTION:Reminder",
  "END:VALARM",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:abc-2",
  "DTSTART;TZID=America/New_York:20261020T143000",
  "SUMMARY:Lab report due for Chem",
  " istry Honors",
  "CATEGORIES:Chemistry Honors",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:weekly",
  "DTSTART:20261015T120000Z",
  "RRULE:FREQ=WEEKLY",
  "SUMMARY:Period 3",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:gone",
  "DTSTART;VALUE=DATE:20261017",
  "STATUS:CANCELLED",
  "SUMMARY:Club",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("parseIcs", () => {
  it("reads one-off items, unfolding and unescaping, and skips repeating and cancelled ones", () => {
    const evs = parseIcs(ICS);
    expect(evs).toHaveLength(2);
    expect(evs[0]).toEqual({ uid: "abc-1@schoology", title: "Unit 4 Test, Cells", date: "2026-10-16", time: null, notes: "Bring a pencil.\nAP Biology", categories: [] });
    expect(evs[1]).toMatchObject({ uid: "abc-2", title: "Lab report due for Chemistry Honors", date: "2026-10-20", time: "14:30", categories: ["Chemistry Honors"] });
  });

  it("names the calendar", () => {
    expect(calendarName(ICS)).toBe("Schoology: Tredyffrin");
  });
});

describe("parseWhen", () => {
  it("reads all-day dates and wall-clock times", () => {
    expect(parseWhen("VALUE=DATE", "20261016")).toEqual({ date: "2026-10-16", time: null });
    expect(parseWhen("", "20261016T0905")).toEqual({ date: "2026-10-16", time: "09:05" });
    expect(parseWhen("", "bad")).toBeNull();
  });
  it("turns UTC times into local ones", () => {
    const r = parseWhen("", "20261016T120000Z")!;
    const local = new Date(Date.UTC(2026, 9, 16, 12, 0));
    expect(r.time).toBe(`${String(local.getHours()).padStart(2, "0")}:00`);
  });
});

describe("guessing", () => {
  it("guesses kinds from plurals and school shorthand", () => {
    const cases: [string, string][] = [
      ["EME Presentations", "project"], ["Early Modern Era Project", "project"], ["Unit 3 Exams", "test"], ["DBQ in class", "test"],
      ["Ch. 5 Summative", "test"], ["Vocab Quizzes", "quiz"], ["Check-in 2", "quiz"], ["Unit 4 test review sheet", "homework"],
      ["Test corrections", "homework"], ["DeltaMath 4.2", "homework"], ["Read pp. 112-130", "homework"], ["Final draft of essay", "project"],
      ["Spirit week", "other"],
    ];
    for (const [title, kind] of cases) expect([title, guessKind(title)]).toEqual([title, kind]);
  });

  it("guesses the kind from the title", () => {
    expect(guessKind("Unit 4 Test")).toBe("test");
    expect(guessKind("Vocab quiz 3")).toBe("quiz");
    expect(guessKind("Lab report due")).toBe("project");
    expect(guessKind("Worksheet 3.2")).toBe("homework");
    expect(guessKind("Pep rally")).toBe("other");
  });
  it("matches a class by name, longest first", () => {
    const classes = [{ id: "bio", name: "Biology" }, { id: "apbio", name: "AP Biology" }, { id: "chem", name: "Chemistry Honors" }];
    expect(guessClass({ title: "Unit 4 Test", categories: [], notes: "AP Biology" }, classes)).toBe("apbio");
    expect(guessClass({ title: "Lab", categories: ["Chemistry Honors"], notes: null }, classes)).toBe("chem");
    expect(guessClass({ title: "Pep rally", categories: [], notes: null }, classes)).toBeNull();
  });

  it("knows class nicknames, but only when they point to one class", () => {
    const classes = [{ id: "chem", name: "Chemistry Honors" }, { id: "apush", name: "AP United States History" }, { id: "calc", name: "AP Calculus BC" }, { id: "precalc", name: "Precalculus" }];
    const g = (title: string) => guessClass({ title, categories: [], notes: null }, classes);
    expect(g("Chem lab 3")).toBe("chem");
    expect(g("APUSH DBQ")).toBe("apush");
    expect(g("Calc quiz")).toBe("calc");
    expect(g("Precalc HW 2.1")).toBe("precalc");
    expect(g("chemistry-ish words in chemical")).toBeNull();
    // Two biology classes: "bio" alone can't choose.
    expect(guessClass({ title: "Bio test", categories: [], notes: null }, [{ id: "a", name: "Biology" }, { id: "b", name: "AP Biology" }])).toBeNull();
  });
});

describe("safeFeedUrl", () => {
  it("allows public https calendar links, keeping their secret query", () => {
    expect(safeFeedUrl("webcal://p123-caldav.icloud.com/published/2/abc")).toBe("https://p123-caldav.icloud.com/published/2/abc");
    expect(safeFeedUrl("https://app.schoology.com/calendar/feed/ical/123/abc/ical.ics?x=1")).toBe("https://app.schoology.com/calendar/feed/ical/123/abc/ical.ics?x=1");
  });
  it("refuses anything that could reach a private network", () => {
    for (const u of ["http://example.com/a.ics", "https://127.0.0.1/a.ics", "https://localhost/a.ics", "https://printer.local/a", "https://x.supabase.co/a", "https://u:p@example.com/a", "https://example.com:8443/a", "not a url"]) {
      expect(safeFeedUrl(u)).toBeNull();
    }
  });
});
