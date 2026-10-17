import { describe, expect, it } from "vitest";
import { buildSummary, type SupportInput } from "../../supabase/functions/_lib/support";

const base: SupportInput = {
  name: "Ava",
  today: "2026-10-16",
  localDate: (iso) => iso.slice(0, 10),
  subjects: [{ id: "bio", name: "Biology" }, { id: "his", name: "History" }],
  activity: [],
  events: [],
  cards: [],
  quizzes: [],
  mistakes: [],
};

describe("support view summary", () => {
  it("counts studying by day and class", () => {
    const s = buildSummary({
      ...base,
      activity: [
        { at: "2026-10-16T15:00:00Z", subject_id: "bio", n: 10, correct: 8 },
        { at: "2026-10-14T15:00:00Z", subject_id: "bio", n: 1, correct: null },
        { at: "2026-10-01T15:00:00Z", subject_id: "his", n: 4, correct: 1 },
        { at: "2026-08-01T15:00:00Z", subject_id: "his", n: 50, correct: 50 },
      ],
    });
    expect(s.days).toHaveLength(28);
    expect(s.days.at(-1)).toEqual({ date: "2026-10-16", n: 10 });
    expect(s.daysStudied7).toBe(2);
    expect(s.items7).toBe(11);
    expect(s.classes).toEqual([{ name: "Biology", items7: 11, accuracy30: 80 }, { name: "History", items7: 0, accuracy30: 25 }]);
  });

  it("lists what's coming up, with readiness for tests and quizzes in the units they cover", () => {
    const s = buildSummary({
      ...base,
      events: [
        { id: "late", subject_id: "bio", kind: "test", title: "Final", due_on: "2026-12-01", done_at: null, unit_ids: [] },
        { id: "hw", subject_id: "his", kind: "homework", title: "Read ch. 3", due_on: "2026-10-17", done_at: "2026-10-16T10:00:00Z", unit_ids: [] },
        { id: "t", subject_id: "bio", kind: "test", title: "Unit 4 test", due_on: "2026-10-20", done_at: null, unit_ids: ["u4"] },
        { id: "past", subject_id: "bio", kind: "quiz", title: "Old quiz", due_on: "2026-10-10", done_at: null, unit_ids: [] },
      ],
      cards: [...Array(10)].map(() => ({ subject_id: "bio", unit_id: "u4", state: 2 })).concat([{ subject_id: "bio", unit_id: "u3", state: 0 }]),
      quizzes: [{ subject_id: "bio", unit_id: "u4", count: 10, last: { correct: 9, total: 10 } }],
    });
    expect(s.upcoming.map((u) => u.title)).toEqual(["Read ch. 3", "Unit 4 test"]);
    expect(s.upcoming[0]).toMatchObject({ className: "History", done: true, readiness: null });
    expect(s.upcoming[1].readiness?.level).toBe("ready"); // the unit 3 card isn't on this test
  });

  it("never carries content: only names, titles, counts, dates and readiness", () => {
    const s = buildSummary({ ...base, events: [{ id: "t", subject_id: "bio", kind: "test", title: "Unit 4 test", due_on: "2026-10-20", done_at: null, unit_ids: [] }] });
    expect(Object.keys(s).sort()).toEqual(["classes", "days", "daysStudied7", "items7", "name", "today", "upcoming"]);
    expect(Object.keys(s.upcoming[0]).sort()).toEqual(["className", "done", "due_on", "kind", "readiness", "title"]);
  });
});
