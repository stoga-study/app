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

/** What kind of item a title sounds like. */
export function guessKind(title: string): EventKind {
  const t = title.toLowerCase();
  if (/\bquiz(zes)?\b/.test(t)) return "quiz";
  if (/\b(test|exam|midterm|final|assessment|ap exam|keystone)\b/.test(t)) return "test";
  if (/\b(project|presentation|essay|paper|lab report|research|portfolio)\b/.test(t)) return "project";
  if (/\b(hw|homework|assignment|worksheet|reading|problems?|due|packet|questions|notes|read)\b/.test(t)) return "homework";
  return "other";
}

/**
 * Which class an item belongs to: a class whose name appears in its title, categories or notes (the
 * longest match wins, so "AP Biology" beats "Biology"). Null when none does.
 */
export function guessClass(e: Pick<IcsEvent, "title" | "categories" | "notes">, classes: { id: string; name: string }[]): string | null {
  const hay = [e.title, ...e.categories, e.notes ?? ""].join(" \n ").toLowerCase();
  const hit = classes
    .filter((c) => c.name.trim().length > 2 && hay.includes(c.name.trim().toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)[0];
  return hit?.id ?? null;
}

/** The calendar's own name (X-WR-CALNAME), for naming a linked calendar. */
export const calendarName = (text: string) => {
  const line = unfold(text).find((l) => /^X-WR-CALNAME[:;]/i.test(l));
  return line ? unescape(line.slice(line.indexOf(":") + 1)).slice(0, 80) || null : null;
};
