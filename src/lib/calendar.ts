/** Calendar dates as the student's local "YYYY-MM-DD" strings, so a due date never shifts with time zones. */
import { appLocale, dateFormat, weekStart } from "./locale";

const pad = (n: number) => String(n).padStart(2, "0");

export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoDate(new Date());
export const fromIso = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (iso: string, n: number) => {
  const d = fromIso(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
};
/** Whole days from `a` to `b` (negative when `b` is earlier). Safe across daylight-saving changes. */
export const daysBetween = (a: string, b: string) => Math.round((Date.UTC(...ymd(b)) - Date.UTC(...ymd(a))) / 86400_000);
const ymd = (iso: string): [number, number, number] => {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m - 1, d];
};

/** The weeks shown for a month, starting on the student's first day of the week, padded with the days around it. */
export function monthGrid(year: number, month: number, firstDay = weekStart()): string[][] {
  const first = new Date(year, month, 1);
  let day = addDays(isoDate(first), -((first.getDay() - firstDay + 7) % 7));
  const weeks: string[][] = [];
  do {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  } while (fromIso(day).getMonth() === month);
  return weeks;
}

/** One-letter (or shortest) weekday names, in order from the first day of the week. */
export function weekdayLetters(firstDay = weekStart(), locale = appLocale()) {
  // 2026-10-04 is a Sunday.
  return Array.from({ length: 7 }, (_, i) => dateFormat({ weekday: "narrow" }, locale).format(new Date(2026, 9, 4 + ((firstDay + i) % 7))));
}

export const shortDate = (iso: string, locale = appLocale()) => dateFormat({ weekday: "short", month: "short", day: "numeric" }, locale).format(fromIso(iso));
export const monthTitle = (year: number, month: number, locale = appLocale()) => dateFormat({ month: "long", year: "numeric" }, locale).format(new Date(year, month, 1));

const capital = (s: string, locale: string) => s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);

/** "Today", "Tomorrow", "In 3 days", "Yesterday", "3 days ago" (in the student's language), or the date when it is further off. */
export function whenText(iso: string, from = today(), locale = appLocale()) {
  const n = daysBetween(from, iso);
  if (n >= -6 && n <= 13) {
    try {
      return capital(new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(n, "day"), locale);
    } catch {
      /* no relative-time support: use the date */
    }
  }
  return shortDate(iso, locale);
}

/** "3:30 PM" or "15:30", as the student's region writes times, from a Postgres time ("15:30:00"). */
export function timeText(t: string | null, locale = appLocale()) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return dateFormat({ hour: "numeric", minute: "2-digit" }, locale).format(new Date(2000, 0, 1, h, m));
}
