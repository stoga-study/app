// Phone notifications: settings, the student's local time, quiet hours and what to say. Pure, unit tested.

export type NotifyPrefs = { study: boolean; tests: boolean; time: string; quiet_start: string; quiet_end: string; tz: string };
export const DEFAULT_PREFS: NotifyPrefs = { study: true, tests: true, time: "19:00", quiet_start: "21:30", quiet_end: "07:30", tz: "America/New_York" };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const validTz = (tz: unknown): tz is string => {
  if (typeof tz !== "string" || tz.length > 60) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** Settings from a saved value, with safe defaults for anything missing or odd. */
export function toPrefs(v: unknown): NotifyPrefs {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const hm = (x: unknown, d: string) => (typeof x === "string" && HHMM.test(x) ? x : d);
  return {
    study: typeof o.study === "boolean" ? o.study : DEFAULT_PREFS.study,
    tests: typeof o.tests === "boolean" ? o.tests : DEFAULT_PREFS.tests,
    time: hm(o.time, DEFAULT_PREFS.time),
    quiet_start: hm(o.quiet_start, DEFAULT_PREFS.quiet_start),
    quiet_end: hm(o.quiet_end, DEFAULT_PREFS.quiet_end),
    tz: validTz(o.tz) ? o.tz : DEFAULT_PREFS.tz,
  };
}

export const minutesOf = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** The student's local date ("YYYY-MM-DD"), minutes past midnight, and when their day began (as an instant). */
export function localNow(tz: string, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now).map((p) => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  const offsetMs = asUtc - Math.floor(now.getTime() / 1000) * 1000;
  const dayStart = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) - offsetMs);
  return { date, minutes, dayStart };
}

/** Is `now` (minutes) within the 15 minutes starting at `at`? The schedule runs every 15 minutes. */
export const inWindow = (now: number, at: number, size = 15) => ((now - at + 1440) % 1440) < size;

/** Quiet hours, which may run past midnight (21:30 to 07:30). */
export function isQuiet(now: number, start: number, end: number) {
  if (start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

export type Message = { kind: "study" | "test"; title: string; body: string; url: string };

/** What to send this evening, if anything: a test tomorrow beats a plain study reminder. */
export function eveningMessage(o: { firstName: string | null; due: number; testTomorrow: { id: string; title: string } | null; studiedToday: boolean; prefs: NotifyPrefs }): Message | null {
  if (o.prefs.tests && o.testTomorrow) {
    return { kind: "test", title: `${o.testTomorrow.title} is tomorrow`, body: o.studiedToday ? "Nice work today. A quick look over your review pack tonight and you're set." : "A short review tonight goes a long way. Your plan is ready.", url: `/exam/${o.testTomorrow.id}` };
  }
  if (o.prefs.study && !o.studiedToday && o.due > 0) {
    return { kind: "study", title: o.firstName ? `${o.firstName}, ${o.due} card${o.due === 1 ? "" : "s"} ready` : `${o.due} card${o.due === 1 ? "" : "s"} ready`, body: "Ten minutes tonight keeps them fresh.", url: "/review/session?size=10" };
  }
  return null;
}
