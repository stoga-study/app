// The study coach: an agent that looks things up in the student's own study material and acts on it,
// then answers. Prompts, schemas, labels and checks live here as pure functions (unit tested); the
// coach function does the reading, writing and model calls.
import { CRISIS_LINE } from "./tutor.ts";

export const KINDS = ["test", "quiz", "homework", "project", "other"] as const;
export type Kind = (typeof KINDS)[number];

export const READ_TOOLS = ["calendar", "search", "read_file", "files", "progress", "mistakes", "weak_cards"] as const;
export const WRITE_TOOLS = ["add_event", "update_event", "complete_event", "uncomplete_event", "delete_event", "set_current_unit", "make_cards", "write_note", "link"] as const;
export const TOOLS = [...READ_TOOLS, ...WRITE_TOOLS] as const;
export type Tool = (typeof TOOLS)[number];
export type Call = { tool: Tool; args: Record<string, unknown> };

/** Each round the model picks tools to call; an empty list means it is ready to answer. Args are a JSON string, checked per tool. */
export const STEP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["calls"],
  properties: {
    calls: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tool", "args"],
        properties: { tool: { type: "string", enum: [...TOOLS] }, args: { type: "string" } },
      },
    },
  },
};
export const MAX_ROUNDS = 4;
export const MAX_CALLS = 6;
export const MAX_CARDS = 20;

/** Parse the model's calls, dropping unknown tools, unreadable args and repeats of an earlier call. */
export function parseCalls(raw: { tool: string; args: string }[] | undefined, seen: Set<string>): Call[] {
  const out: Call[] = [];
  for (const c of raw ?? []) {
    if (!(TOOLS as readonly string[]).includes(c.tool)) continue;
    let args: Record<string, unknown> = {};
    try {
      const v = JSON.parse(c.args || "{}");
      if (v && typeof v === "object" && !Array.isArray(v)) args = v;
    } catch {
      continue;
    }
    const key = `${c.tool}:${JSON.stringify(args)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ tool: c.tool as Tool, args });
    if (out.length >= MAX_CALLS) break;
  }
  return out;
}

export type Ctx = {
  today: string;
  firstName: string | null;
  classes: { ref: string; name: string; currentUnit: string | null; units: { ref: string; name: string }[]; dueCards: number }[];
  events: { ref: string; kind: string; title: string; classRef: string | null; date: string; time: string | null; done: boolean; unitRefs: string[] }[];
  files?: { ref: string; name: string; classRef: string; unitRef: string | null }[];
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

/** The context block: today, a date table (so weekdays never need arithmetic), classes, files, the calendar. */
export function contextText(c: Ctx) {
  const days = Array.from({ length: 15 }, (_, i) => addDays(c.today, i)).map((d, i) => `${i === 0 ? "today" : i === 1 ? "tomorrow" : WEEKDAY[dayOf(d)]} ${d}`);
  const cls = c.classes.length
    ? c.classes.map((k) => `${k.ref} ${k.name}${k.dueCards ? ` (${k.dueCards} cards due)` : ""}; units: ${k.units.length ? k.units.map((u) => `${u.ref} ${u.name}${u.ref === k.currentUnit ? " [current]" : ""}`).join(", ") : "none yet"}`).join("\n")
    : "none";
  const evs = c.events.length
    ? c.events.map((e) => `${e.ref} ${e.kind} "${e.title}" ${e.classRef ?? "no class"} ${e.date}${e.time ? ` ${e.time}` : ""}${e.unitRefs.length ? ` units ${e.unitRefs.join(",")}` : ""}${e.done ? " [done]" : ""}`).join("\n")
    : "nothing yet";
  const files = c.files?.length ? c.files.map((f) => `${f.ref} "${f.name}" ${f.classRef}${f.unitRef ? ` ${f.unitRef}` : ""}`).join("\n") : "none";
  return [
    `Today is ${WEEKDAY[dayOf(c.today)]} ${c.today}. Dates: ${days.join("; ")}.`,
    c.firstName ? `Student's first name: ${c.firstName}.` : "",
    `Classes:\n${cls}`,
    `Files (newest first):\n${files}`,
    `Calendar (from a week ago on):\n${evs}`,
    `Today's study plan: ${c.planToday.length ? c.planToday.join("; ") : "nothing planned"}.`,
    `Open quiz mistakes: ${c.mistakes}${c.weakTopics.length ? `; weakest topics: ${c.weakTopics.join(", ")}` : ""}.`,
  ].filter(Boolean).join("\n\n");
}

/** Deciding what to look up and do. Runs up to MAX_ROUNDS times; results come back between rounds. */
export function stepSystem() {
  return `You are the Stoga.study coach's planner. Decide which tools to call for the student's latest message, before anyone answers. Reply with {"calls": [...]}; each call has "tool" and "args" (a JSON object written as a string). Return {"calls": []} once you have what you need, or when the message needs no tools (small talk, feelings, a question the context already answers).

Refs: classes C1.., units U1.., files F1.., calendar items E1.. come from the context. Use only refs that exist. The context is the truth right now; earlier messages may describe changes that were since undone.

The context already has their whole calendar from a week ago on (homework, projects, tests, quizzes), their classes, files and today's plan. Questions about those ("what homework do I have", "when's my bio test") need no tools: return no calls.

Look things up (results come back to you next round):
- calendar {"from": "YYYY-MM-DD"?, "to": "YYYY-MM-DD"?, "kind"?: test|quiz|homework|project|other, "class"?: "C1"}: calendar items in a range, including older ones the context leaves out.
- search {"query": "...", "class": "C1"?}: search their notes, files, cards and quiz questions. Use it before explaining or summarizing anything from their material, and before making cards or notes from it.
- read_file {"file": "F1"}: the text of one file (its first pages). Use it for "my latest notes" (the newest file is F1, files are listed newest first), "this file", or making cards, a summary or a plan from a particular file.
- files {"class": "C1"?, "unit": "U1"?}: their files, with what has been made from each.
- progress {"class": "C1"?}: cards by stage, cards due, reviews this week, latest quiz and practice-test scores.
- mistakes {"class": "C1"?}: open quiz mistakes, with the right answers.
- weak_cards {"class": "C1"?}: the cards they find hardest.

Do things (only when they asked, or clearly told you something to record):
- add_event {"title", "kind": test|quiz|homework|project|other, "date": "YYYY-MM-DD" from the date table, "class"?, "units"?: ["U1"], "time"?: "HH:MM"}
- update_event {"event": "E1", plus only the fields that change}
- complete_event / uncomplete_event / delete_event {"event": "E1"} (delete only when clearly asked)
- set_current_unit {"unit": "U1"}
- make_cards {"class": "C1", "unit"?: "U1", "cards": [{"front", "back"}]}: up to ${MAX_CARDS} flashcards, when they ask for cards. Base them on search results from their material when there are any; keep each answer short and exact.
- write_note {"class": "C1", "unit"?: "U1", "title", "body"}: save a note to their notes (a plan, a summary, a checklist) when they ask you to write something down. If it doesn't exist yet (like "write my study plan down"), write it yourself from the context and what you looked up, in the same round; don't refuse or ask first. Plain text with simple "- " lists.
- link {"to": review|unit_quiz|practice_test|mistakes|file|exam|calendar|tutor|class, "class"?, "unit"?, "event"?, "file"?}: a button for them to tap, when starting something would help (for example review C1's cards, the practice test for E2, open F3).

If the date, class or item is unclear, call nothing and let the answer ask. Never more than ${MAX_CALLS} calls a round. You cannot delete or change files, cards or quizzes, so never try.`;
}

/** Writing the answer, streamed, after the tools ran. */
export type Persona = { name: string; vibe: "chill" | "hype" | "direct" | "calm"; length: "short" | "normal" | "detailed" };
const VOICE: Record<Persona["vibe"], string> = {
  chill: "You sound like a warm, real older student who has their back: casual, kind, direct, never preachy or fake-cheerful.",
  hype: "You are high-energy and encouraging: you celebrate their wins and keep them moving, with the odd exclamation mark. Still honest: never fake praise.",
  direct: "You are straight to the point: no small talk or pleasantries, the answer first, then the next step. Friendly, never cold.",
  calm: "You are gentle and steady: short, unhurried sentences, reassuring without being sugary. Good for stressful weeks.",
};
const WORDS: Record<Persona["length"], number> = { short: 60, normal: 120, detailed: 220 };

/** The student's choices for their coach, read safely from their profile. */
export function toPersona(v: unknown): Persona {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const name = typeof o.name === "string" ? o.name.replace(/[^\p{L}\p{N} '.-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 24) : "";
  return {
    name: name || "Coach",
    vibe: o.vibe === "hype" || o.vibe === "direct" || o.vibe === "calm" ? o.vibe : "chill",
    length: o.length === "short" || o.length === "detailed" ? o.length : "normal",
  };
}

export function answerSystem(feeling: "stressed" | null, persona: Persona = { name: "Coach", vibe: "chill", length: "normal" }, language = "English") {
  return `You are ${persona.name === "Coach" ? "the Stoga.study coach" : `${persona.name}, the student's Stoga.study coach`} for a high school student. ${VOICE[persona.vibe]} No guilt, no pressure.

You help with everything around studying: planning the week, what to study next, how they're doing, their material (you can see their files, notes, cards and mistakes through what was looked up below), making flashcards and notes, and keeping their calendar. For explaining a concept in depth or working a homework problem, give a short pointer and suggest the tutor.

How to answer:
- ${feeling === "stressed" ? "They sound stressed. Start with one genuine sentence that acknowledges it, then ONE small concrete step. Do not list everything." : "Lead with the answer or the one thing to do next."}
- Usually under ${WORDS[persona.length]} words. Short paragraphs; a short "- " list only when it really helps (steps, a plan). **Bold** for one or two key things at most. No headings.
- The context above is theirs and already loaded: their calendar (every homework, project, test and quiz from a week ago on, with "[done]" on finished ones), classes, files and today's plan. Answer calendar and homework questions straight from it, listing the items with their dates. Never say you can't see their calendar.
- Use what was looked up below too. Never invent tests, dates, scores, files or numbers. If something isn't in the context or the lookups, say so.
- The context (calendar, classes, files) is the truth right now. Earlier messages in this chat can be out of date, since the student can undo changes; never repeat a date or item from them that the context doesn't show.
- Describe what you did exactly as listed under "Done" (the app shows each with an Undo button). Never claim anything else was done. If something failed, say so plainly.
- If buttons were made (listed under "Buttons"), mention them naturally, like "tap the button below".
- Plain text and Unicode math, no LaTeX, no emoji.${language !== "English" ? `\n- Reply in ${language}, written naturally for a high schooler. Keep class names, file names and anything quoted from their material as they are.` : ""}`;
}

/** What a step looks like while it runs ("Searching your notes for mitosis"). */
export function stepLabel(c: Call, names: { cls: (ref: unknown) => string | null; unit: (ref: unknown) => string | null; file?: (ref: unknown) => string | null }) {
  const cls = names.cls(c.args.class);
  const where = cls ? ` in ${cls}` : "";
  const q = typeof c.args.query === "string" ? c.args.query.slice(0, 40) : "";
  switch (c.tool) {
    case "search": return q ? `Searching your notes${where} for “${q}”` : `Searching your notes${where}`;
    case "read_file": return `Reading ${names.file?.(c.args.file) ?? "your file"}`;
    case "calendar": return `Checking your calendar${where}`;
    case "files": return `Looking at your files${where}`;
    case "progress": return `Checking how you're doing${where}`;
    case "mistakes": return `Going through your quiz mistakes${where}`;
    case "weak_cards": return `Finding your hardest cards${where}`;
    case "add_event": return "Adding it to your calendar";
    case "update_event": return "Updating your calendar";
    case "complete_event": return "Ticking it off";
    case "uncomplete_event": return "Unticking it";
    case "delete_event": return "Removing it from your calendar";
    case "set_current_unit": return `Setting your current unit${names.unit(c.args.unit) ? ` to ${names.unit(c.args.unit)}` : ""}`;
    case "make_cards": return `Making flashcards${where}`;
    case "write_note": return `Writing a note${where}`;
    case "link": return "Getting a button ready";
  }
}

/** A language name the app sent ("Spanish"), or English. Letters and spaces only, so it can't carry instructions. */
export const toLanguage = (v: unknown) => (typeof v === "string" && /^[A-Za-z ()-]{2,40}$/.test(v) ? v : "English");

/** The fixed reply to anything that sounds like a crisis: no model call, and always the 988 line. */
export function crisisReply(firstName: string | null) {
  return `${firstName ? `${firstName}, I` : "I"}'m really glad you told me, and I'm sorry it feels this heavy right now. Your studying can wait. ${CRISIS_LINE}`;
}

/** A clean, safe title: one line, at most 120 characters. */
export const cleanTitle = (s: unknown) => (typeof s === "string" ? s : "").replace(/\s+/g, " ").trim().slice(0, 120);
export const validKind = (s: unknown): Kind | null => (KINDS as readonly string[]).includes(String(s ?? "")) ? (s as Kind) : null;

/** Cards the model wrote: trimmed, non-empty, at most MAX_CARDS, no repeats. */
export function cleanCards(raw: unknown): { front: string; back: string }[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: { front: string; back: string }[] = [];
  for (const c of raw) {
    const front = typeof c?.front === "string" ? c.front.trim().slice(0, 1000) : "";
    const back = typeof c?.back === "string" ? c.back.trim().slice(0, 2000) : "";
    if (!front || !back || seen.has(front.toLowerCase())) continue;
    seen.add(front.toLowerCase());
    out.push({ front, back });
    if (out.length >= MAX_CARDS) break;
  }
  return out;
}
