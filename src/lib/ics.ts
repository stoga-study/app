// Reading a student's own calendar (.ics / iCalendar) into calendar items. Pure, unit tested.
import type { EventKind } from "./queries/events";
import { isoDate } from "./calendar";

export type IcsEvent = { uid: string; title: string; date: string; time: string | null; notes: string | null; categories: string[] };

/** Undo line folding: a line starting with a space or tab continues the one before. */
const unfold = (text: string) => text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
const unescape = (v: string) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * When an item is, as the student's local date and time. All-day items (VALUE=DATE) have no time.
 * A time ending in Z is UTC and is turned into local time; a time with a TZID or none is taken as
 * the wall-clock time it says, which is what a school calendar means.
 */
export function parseWhen(params: string, value: string): { date: string; time: string | null } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  if (!h || /VALUE=DATE(?!-)/i.test(params)) return { date: `${y}-${mo}-${d}`, time: null };
  if (z) {
    const local = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
    return { date: isoDate(local), time: `${pad(local.getHours())}:${pad(local.getMinutes())}` };
  }
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
}

/** The one-off items in a calendar file. Repeating items (class periods, weekly clubs) are left out. */
export function parseIcs(text: string): IcsEvent[] {
  const out: IcsEvent[] = [];
  let cur: Record<string, { params: string; value: string }> | null = null;
  let depth = 0; // inside a VALARM or similar, inside the event
  for (const line of unfold(text)) {
    if (/^BEGIN:VEVENT$/i.test(line.trim())) { cur = {}; depth = 0; continue; }
    if (!cur) continue;
    if (/^BEGIN:/i.test(line)) { depth++; continue; }
    if (/^END:VEVENT$/i.test(line.trim())) {
      const start = cur.DTSTART ? parseWhen(cur.DTSTART.params, cur.DTSTART.value) : null;
      const title = cur.SUMMARY ? unescape(cur.SUMMARY.value).replace(/\s+/g, " ").slice(0, 120) : "";
      const cancelled = /CANCELLED/i.test(cur.STATUS?.value ?? "");
      if (start && title && !cur.RRULE && !cancelled) {
        out.push({
          uid: (cur.UID?.value.trim() || `${start.date}-${title}`).slice(0, 300),
          title,
          date: start.date,
          time: start.time,
          notes: cur.DESCRIPTION ? unescape(cur.DESCRIPTION.value).slice(0, 1000) || null : null,
          categories: cur.CATEGORIES ? unescape(cur.CATEGORIES.value).split(",").map((c) => c.trim()).filter(Boolean) : [],
        });
      }
      cur = null;
      continue;
    }
    if (/^END:/i.test(line)) { depth = Math.max(0, depth - 1); continue; }
    if (depth > 0) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const [name, ...params] = line.slice(0, colon).split(";");
    const key = name.toUpperCase();
    if (!cur[key]) cur[key] = { params: params.join(";"), value: line.slice(colon + 1) };
  }
  return out;
}

// Words for each kind, plurals and school shorthand included. Checked in order: quiz, test, project,
// homework, so "Unit 4 test" is a test even though it is also due.
const QUIZ = /\b(quiz(z?es)?|pop quiz|vocab check|check[- ]?ins?|exit tickets?)\b/;
const TEST = /\b(tests?|exams?|midterms?|finals?(?! (drafts?|projects?|papers?|presentations?|copy|copies|versions?))|assessments?|summatives?|cfas?|benchmarks?|unit tests?|ap exams?|keystones?|dbqs?|frqs?|leqs?|in[- ]class (essay|writing)s?|performance tasks?)\b/;
const PREP = /\b(review( sheet)?s?|study guides?|prep|corrections?|retakes? form|reflections?)\b/;
const PROJECT = /\b(projects?|proj|presentations?|pres|essays?|papers?|lab reports?|research|portfolios?|posters?|speech(es)?|debates?|slides?|videos?|reports?|drafts?|final drafts?|websites?|models?)\b/;
const HOMEWORK = /\b(hw|homework|assignments?|worksheets?|readings?|read|problems?|probs?|packets?|questions|notes|due|practice|exercises?|study guides?|chapters?|ch\.?\s?\d|pages?|pp?\.\s?\d|labs?|journals?|annotations?|responses?|discussions?|edpuzzles?|deltamath|khan|ixl|quizlet)\b/;

/** What kind of item a title sounds like. */
export function guessKind(title: string): EventKind {
  const t = title.toLowerCase();
  if (QUIZ.test(t)) return "quiz";
  // Getting ready for a test, or fixing one, is work to do, not the test.
  if (TEST.test(t)) return PREP.test(t) ? "homework" : "test";
  if (PROJECT.test(t)) return "project";
  if (HOMEWORK.test(t)) return "homework";
  return "other";
}

// Short names students and teachers use for classes, keyed by a word in the class's name.
const NICKNAMES: [RegExp, string[]][] = [
  [/biology/, ["bio"]],
  [/chemistry/, ["chem"]],
  [/physics/, ["phys"]],
  [/precalculus|pre-calculus/, ["precalc", "pre-calc"]],
  [/calculus/, ["calc"]],
  [/statistics/, ["stats", "stat"]],
  [/algebra/, ["alg"]],
  [/geometry/, ["geo"]],
  [/united states history|u\.s\. history|us history|american history/, ["apush", "ush", "us hist"]],
  [/world history/, ["whap", "apwh", "world hist"]],
  [/european history/, ["apeuro", "euro"]],
  [/government|civics/, ["gov", "govt", "civics"]],
  [/economics/, ["econ", "macro", "micro"]],
  [/psychology/, ["psych"]],
  [/english|literature|language and composition/, ["eng", "english", "lit", "lang"]],
  [/spanish/, ["span", "spanish", "español"]],
  [/french/, ["french", "français"]],
  [/german/, ["ger", "german"]],
  [/latin/, ["latin"]],
  [/chinese|mandarin/, ["chinese", "mandarin"]],
  [/computer science/, ["cs", "csa", "csp", "apcs", "comp sci", "coding"]],
  [/environmental/, ["apes", "enviro"]],
  [/anatomy/, ["anatomy", "a&p"]],
  [/health/, ["health"]],
  [/physical education|phys ed/, ["gym"]],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (hay: string, w: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(w)}($|[^\\p{L}\\p{N}])`, "u").test(hay);

/**
 * Which class an item belongs to. First a class whose full name appears (longest wins, so "AP
 * Biology" beats "Biology"); then a nickname ("chem", "APUSH") that fits exactly one class. Null
 * when nothing fits, or when a nickname fits more than one class.
 */
export function guessClass(e: Pick<IcsEvent, "title" | "categories" | "notes">, classes: { id: string; name: string }[]): string | null {
  const hay = [e.title, ...e.categories, e.notes ?? ""].join(" \n ").toLowerCase();
  const full = classes
    .filter((c) => c.name.trim().length > 2 && hay.includes(c.name.trim().toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (full) return full.id;
  const byNick = classes.filter((c) => {
    const name = c.name.toLowerCase();
    // Only the first match counts, so Precalculus answers to "precalc" and not to "calc".
    const nicks = NICKNAMES.find(([re]) => re.test(name))?.[1] ?? [];
    return nicks.some((n) => hasWord(hay, n));
  });
  return byNick.length === 1 ? byNick[0].id : null;
}

/** The calendar's own name (X-WR-CALNAME), for naming a linked calendar. */
export const calendarName = (text: string) => {
  const line = unfold(text).find((l) => /^X-WR-CALNAME[:;]/i.test(l));
  return line ? unescape(line.slice(line.indexOf(":") + 1)).slice(0, 80) || null : null;
};
