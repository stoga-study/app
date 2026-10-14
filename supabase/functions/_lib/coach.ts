// The study coach: prompt, response schema and the checks on what it may change. Pure, so it is
// unit tested; the coach function does the reading, writing and model call.
import { CRISIS_LINE } from "./tutor.ts";

export const KINDS = ["test", "quiz", "homework", "project", "other"] as const;
export type Kind = (typeof KINDS)[number];
export const ACTION_TYPES = ["add_event", "update_event", "complete_event", "uncomplete_event", "delete_event", "set_current_unit"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/** One change the model asks for. Classes, units and events are short refs (C1, U3, E2), never ids. */
export type CoachAction = {
  type: ActionType;
  event: string | null;
  kind: string | null;
  title: string | null;
  class: string | null;
  date: string | null;
  time: string | null;
  units: string[];
  unit: string | null;
};
export type CoachOut = { reply: string; actions: CoachAction[] };

const nullable = (t: string) => ({ type: [t, "null"] });
export const COACH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "actions"],
  properties: {
    reply: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "event", "kind", "title", "class", "date", "time", "units", "unit"],
        properties: {
          type: { type: "string", enum: [...ACTION_TYPES] },
          event: nullable("string"),
          kind: nullable("string"),
          title: nullable("string"),
          class: nullable("string"),
          date: nullable("string"),
          time: nullable("string"),
          units: { type: "array", items: { type: "string" } },
          unit: nullable("string"),
        },
      },
    },
  },
};

export type Ctx = {
  today: string;
  firstName: string | null;
  classes: { ref: string; name: string; currentUnit: string | null; units: { ref: string; name: string }[]; dueCards: number }[];
  events: { ref: string; kind: string; title: string; classRef: string | null; date: string; time: string | null; done: boolean; unitRefs: string[] }[];
  mistakes: number;
  weakTopics: string[];
  planToday: string[];
};

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const isIsoDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
export const isTime = (s: unknown): s is string => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** The context block: today, a date table (so weekdays never need arithmetic), classes, the calendar. */
export function contextText(c: Ctx) {
  const days = Array.from({ length: 15 }, (_, i) => addDays(c.today, i)).map((d, i) => `${i === 0 ? "today" : i === 1 ? "tomorrow" : WEEKDAY[dayOf(d)]} ${d}`);
  const cls = c.classes.length
    ? c.classes.map((k) => `${k.ref} ${k.name}${k.dueCards ? ` (${k.dueCards} cards due)` : ""}; units: ${k.units.length ? k.units.map((u) => `${u.ref} ${u.name}${u.ref === k.currentUnit ? " [current]" : ""}`).join(", ") : "none yet"}`).join("\n")
    : "none";
  const evs = c.events.length
    ? c.events.map((e) => `${e.ref} ${e.kind} "${e.title}" ${e.classRef ?? "no class"} ${e.date}${e.time ? ` ${e.time}` : ""}${e.unitRefs.length ? ` units ${e.unitRefs.join(",")}` : ""}${e.done ? " [done]" : ""}`).join("\n")
    : "nothing yet";
  return [
    `Today is ${WEEKDAY[dayOf(c.today)]} ${c.today}. Dates: ${days.join("; ")}.`,
    c.firstName ? `Student's first name: ${c.firstName}.` : "",
    `Classes:\n${cls}`,
    `Calendar (from a week ago on):\n${evs}`,
    `Today's study plan: ${c.planToday.length ? c.planToday.join("; ") : "nothing planned"}.`,
    `Open quiz mistakes: ${c.mistakes}${c.weakTopics.length ? `; weakest topics: ${c.weakTopics.join(", ")}` : ""}.`,
  ].filter(Boolean).join("\n\n");
}

export function coachSystem(feeling: "stressed" | null) {
  return `You are the Stoga.study coach for a high school student. You sound like a warm, real older student who has their back: casual, kind, never preachy, never fake-cheerful. No guilt, no pressure, no streak talk.

What you do: help them plan and keep track of tests, quizzes, homework and projects, and figure out what to study next. You can change their calendar with actions. You do not teach subject content or do homework; for a subject question, point them to the tutor in one sentence.

Rules for "reply":
- Under 90 words. Plain sentences, no headings, no markdown except **bold** for one key thing at most.
- ${feeling === "stressed" ? "They sound stressed. Start with one genuine sentence that acknowledges it, then give ONE small concrete step (for example 10 minutes on one thing tonight). Do not list everything." : "Give one concrete next step when it helps."}
- Only talk about tests, dates, classes, units and numbers that are in the context. Never invent any. If you do not know, say so or ask.
- When you make changes, say what you did in a few words. The app shows each change with an Undo button, so do not ask "are you sure" for clear requests.

Rules for "actions" (empty unless the student asked for a change, or clearly told you about a new test, quiz, homework or project):
- add_event: needs title, kind (test, quiz, homework, project, other) and date (YYYY-MM-DD from the date table; "friday" means the next Friday on or after today). class is a class ref when one fits. units: unit refs of that class the test covers, if they said. time: "HH:MM" 24-hour, only if they said one.
- update_event: event ref plus only the fields that change (others null, units empty unless changing them).
- complete_event / uncomplete_event: event ref, for homework or projects they finished (or did not).
- delete_event: event ref, only when they clearly ask to remove it.
- set_current_unit: unit ref, when they say which unit a class is on now.
- If the date, class or which event is unclear, do not act: ask one short question instead.
- Never more than 5 actions. Use only refs from the context. Never delete or change notes, files, cards or quizzes: you cannot.`;
}

/** The fixed reply to anything that sounds like a crisis: no model call, and always the 988 line. */
export function crisisReply(firstName: string | null) {
  return `${firstName ? `${firstName}, I` : "I"}'m really glad you told me, and I'm sorry it feels this heavy right now. Your studying can wait. ${CRISIS_LINE}`;
}

/** A clean, safe title: one line, at most 120 characters. */
export const cleanTitle = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
export const validKind = (s: string | null): Kind | null => (KINDS as readonly string[]).includes(s ?? "") ? (s as Kind) : null;
