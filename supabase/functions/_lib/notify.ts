// Phone notifications: settings, the student's local time, quiet hours and what to say. Pure, unit tested.

export type NotifyPrefs = { study: boolean; tests: boolean; checkins: boolean; time: string; quiet_start: string; quiet_end: string; tz: string };
export const DEFAULT_PREFS: NotifyPrefs = { study: true, tests: true, checkins: true, time: "19:00", quiet_start: "21:30", quiet_end: "07:30", tz: "America/New_York" };

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
    checkins: typeof o.checkins === "boolean" ? o.checkins : DEFAULT_PREFS.checkins,
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

export type Kind = "test" | "rough" | "comeback" | "study" | "quiet";
export type Message = { kind: Kind; variant: number; title: string; body: string; url: string };

/** The wordings for each kind; the next one sent is never the same as the last. */
const WORDS: Record<Exclude<Kind, "test" | "study">, ((x: { coach: string; title: string; when: string }) => { title: string; body: string })[]> = {
  rough: [
    ({ coach }) => ({ title: `${coach}: tough quiz today?`, body: "That's how you find what to fix. Want to pick the first thing together?" }),
    ({ coach }) => ({ title: `${coach}: about that quiz`, body: "A rough score now beats one on test day. Your mistakes are saved, so let's go over a few." }),
    ({ coach }) => ({ title: `${coach}: one quiz isn't the story`, body: "Ten minutes on what you missed tonight and it'll stick much better." }),
  ],
  comeback: [
    ({ title, when }) => ({ title: `Your ${title} is ${when}`, body: "10 minutes tonight?" }),
    ({ title, when }) => ({ title: `${title}, ${when}`, body: "A short review tonight makes the week easier. Your plan is ready." }),
    ({ title, when }) => ({ title: `${when}: ${title}`, body: "One small step tonight. Your study plan has it lined up." }),
  ],
  quiet: [
    ({ coach }) => ({ title: `${coach}: haven't seen you in a few days`, body: "No pressure. Want to pick one small thing for tonight?" }),
    ({ coach }) => ({ title: `${coach}: how's your week going?`, body: "If you've got 10 minutes, I've got something easy to start with." }),
    ({ coach }) => ({ title: `${coach}: just checking in`, body: "Whenever you're ready, I'm here. Even five minutes counts." }),
  ],
};

/** Days since a kind was last sent, and which wording it used. */
export type Sent = Partial<Record<Kind, { daysAgo: number; variant: number }>>;

export type EveningInput = {
  firstName: string | null;
  coachName: string;
  due: number;
  testTomorrow: { id: string; title: string } | null;
  /** The nearest test or quiz within 5 days (after tomorrow), with how it reads ("Friday", "in 3 days"). */
  testSoon: { id: string; title: string; when: string } | null;
  studiedToday: boolean;
  /** Whole days since the last studying, or null if never. */
  daysSinceStudy: number | null;
  /** The lowest quiz or practice-test score today, as a percentage. */
  worstScoreToday: number | null;
  sent: Sent;
  prefs: NotifyPrefs;
};

const next = (kind: keyof typeof WORDS, sent: Sent) => ((sent[kind]?.variant ?? -1) + 1) % WORDS[kind].length;

/**
 * At most one message an evening, in this order: a test tomorrow; a check-in after a rough quiz
 * today; a comeback nudge when a test is close and there's been no studying for 2+ days (at most
 * weekly); due cards if nothing was studied today; a quiet check-in after 4+ days with nothing coming
 * up (at most weekly). Never pushy: if none fits, nothing is sent.
 */
export function eveningMessage(o: EveningInput): Message | null {
  const coach = o.coachName || "Coach";
  if (o.prefs.tests && o.testTomorrow) {
    return { kind: "test", variant: 0, title: `${o.testTomorrow.title} is tomorrow`, body: o.studiedToday ? "Nice work today. A quick look over your review pack tonight and you're set." : "A short review tonight goes a long way. Your plan is ready.", url: `/exam/${o.testTomorrow.id}` };
  }
  if (o.prefs.checkins && o.worstScoreToday != null && o.worstScoreToday < 60) {
    const v = next("rough", o.sent);
    return { kind: "rough", variant: v, ...WORDS.rough[v]({ coach, title: "", when: "" }), url: `/coach?say=${encodeURIComponent("That quiz didn't go great. What should I go over?")}` };
  }
  const weekly = (k: Kind) => (o.sent[k]?.daysAgo ?? 99) >= 7;
  if (o.prefs.checkins && o.testSoon && !o.studiedToday && (o.daysSinceStudy ?? 99) >= 2 && weekly("comeback")) {
    const v = next("comeback", o.sent);
    return { kind: "comeback", variant: v, ...WORDS.comeback[v]({ coach, title: o.testSoon.title, when: o.testSoon.when }), url: `/exam/${o.testSoon.id}` };
  }
  if (o.prefs.study && !o.studiedToday && o.due > 0) {
    return { kind: "study", variant: 0, title: o.firstName ? `${o.firstName}, ${o.due} card${o.due === 1 ? "" : "s"} ready` : `${o.due} card${o.due === 1 ? "" : "s"} ready`, body: "Ten minutes tonight keeps them fresh.", url: "/review/session?size=10" };
  }
  if (o.prefs.checkins && !o.testSoon && o.daysSinceStudy != null && o.daysSinceStudy >= 4 && weekly("quiet")) {
    const v = next("quiet", o.sent);
    return { kind: "quiet", variant: v, ...WORDS.quiet[v]({ coach, title: "", when: "" }), url: "/coach" };
  }
  return null;
}
