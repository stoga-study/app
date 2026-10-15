import { describe, expect, it } from "vitest";
import { goalName, goalProgress, goalText, sessionMinutes, showRecapCard, weekOf, weeklyRecap, type Goal } from "./goals";
import type { HistoryRow } from "./history";

const r = (day: string, kind: HistoryRow["kind"], n: number, correct = 0, subject_id = "bio"): HistoryRow => ({ day, subject_id, kind, n, correct });
const g = (o: Partial<Goal>): Goal => ({ id: "g", kind: "days", target: 3, label: null, subject_id: null, ...o });
const W = { start: "2026-10-11", end: "2026-10-17" };
const rows = [r("2026-10-12", "review", 40, 30), r("2026-10-13", "review", 20, 18, "chem"), r("2026-10-13", "quiz", 10, 6), r("2026-10-15", "tutor", 2), r("2026-10-09", "review", 99)];
const sessions = [{ started_at: "2026-10-12T21:00:00Z", ended_at: "2026-10-12T21:24:00Z", subject_ids: ["bio"], startDay: "2026-10-12" }, { started_at: "2026-10-13T21:00:00Z", ended_at: "2026-10-13T21:00:00Z", subject_ids: ["chem"], startDay: "2026-10-13" }];

describe("goals", () => {
  it("finds the week in the student's own week", () => {
    expect(weekOf("2026-10-15", 0)).toEqual({ start: "2026-10-11", end: "2026-10-17" });
    expect(weekOf("2026-10-15", 1)).toEqual({ start: "2026-10-12", end: "2026-10-18" });
    expect(weekOf("2026-10-11", 1).start).toBe("2026-10-05");
  });

  it("measures each kind of goal from real studying", () => {
    expect(goalProgress(g({ kind: "days", target: 3 }), W, rows, sessions, [])).toMatchObject({ value: 3, done: true });
    expect(goalProgress(g({ kind: "cards", target: 100 }), W, rows, sessions, [])).toMatchObject({ value: 60, done: false, pct: 0.6 });
    expect(goalProgress(g({ kind: "cards", target: 30, subject_id: "bio" }), W, rows, sessions, []).value).toBe(40);
    expect(goalProgress(g({ kind: "questions", target: 10 }), W, rows, sessions, []).done).toBe(true);
    expect(sessionMinutes(sessions[0])).toBe(25);
    expect(goalProgress(g({ kind: "minutes", target: 60 }), W, rows, sessions, []).value).toBe(27);
    expect(goalProgress(g({ kind: "custom", target: 2, label: "Read" }), W, rows, sessions, ["2026-10-12", "2026-10-01"]).value).toBe(1);
  });

  it("names goals and their progress", () => {
    expect(goalName(g({ kind: "cards", target: 100 }), "Biology")).toBe("Review 100 Biology cards");
    expect(goalName(g({ kind: "days", target: 5 }))).toBe("Study 5 days");
    expect(goalName(g({ kind: "custom", target: 3, label: "Read a chapter" }))).toBe("Read a chapter · 3×");
    expect(goalText(g({ kind: "minutes", target: 120 }), 45)).toBe("45 of 120 min");
    expect(goalText(g({ kind: "days", target: 1 }), 0)).toBe("0 of 1 day");
  });
});

describe("weekly recap", () => {
  const all = [
    // Last week (Oct 11 to 17), seen from Monday Oct 19 with Sunday-first weeks.
    ...rows,
    // The week before.
    r("2026-10-05", "review", 30, 28),
  ];
  const recap = weeklyRecap({ today: "2026-10-19", firstDay: 0, rows: all, sessions, goals: [g({ id: "a", kind: "days", target: 3 }), g({ id: "b", kind: "cards", target: 100 })], ticks: {} });

  it("sums up last week", () => {
    expect(recap.week).toEqual({ start: "2026-10-11", end: "2026-10-17" });
    expect(recap).toMatchObject({ activity: 72, days: 3, cards: 60, questions: 10, recallPct: 80, quizPct: 60, goalsMet: 1, goals: 2 });
    expect(recap.bestDay).toEqual({ day: "2026-10-12", activity: 40 });
    expect(recap.change).toBe(-0.44);
    expect(recap.risingClass).toBe("chem");
  });

  it("doesn't judge last week on goals set this week", () => {
    const fresh = weeklyRecap({ today: "2026-10-19", firstDay: 0, rows: all, sessions, goals: [g({ id: "a", kind: "cards", target: 100, created_at: "2026-10-19T08:00:00Z" })], ticks: {} });
    expect(fresh).toMatchObject({ goals: 0, goalsMet: 0 });
    expect(fresh.next).not.toMatch(/close on a goal/);
  });

  it("suggests one thing, by rule", () => {
    expect(recap.next).toMatch(/close on a goal/);
    expect(weeklyRecap({ today: "2026-10-19", firstDay: 0, rows: [], sessions: [], goals: [], ticks: {} }).next).toMatch(/A fresh week/);
    expect(weeklyRecap({ today: "2026-10-19", firstDay: 0, rows: [r("2026-10-12", "review", 20, 10)], sessions: [], goals: [], ticks: {} }).next).toMatch(/slipped/);
    expect(weeklyRecap({ today: "2026-10-19", firstDay: 0, rows: [r("2026-10-12", "review", 20, 19)], sessions: [], goals: [], ticks: {} }).next).toMatch(/Set a goal/);
  });

  it("shows on Home for the first three days of the week", () => {
    expect(showRecapCard("2026-10-18", 0)).toBe(true);
    expect(showRecapCard("2026-10-20", 0)).toBe(true);
    expect(showRecapCard("2026-10-21", 0)).toBe(false);
  });
});
