/** Calendar dates as the student's local "YYYY-MM-DD" strings, so a due date never shifts with time zones. */

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

/** The weeks shown for a month, Sunday first, padded with the days around it. */
export function monthGrid(year: number, month: number): string[][] {
  const first = new Date(year, month, 1);
  let day = addDays(isoDate(first), -first.getDay());
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

const short = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
export const shortDate = (iso: string) => short.format(fromIso(iso));

/** "Today", "Tomorrow", "In 3 days", "Yesterday", "2 days ago", or the date when it is further off. */
export function whenText(iso: string, from = today()) {
  const n = daysBetween(from, iso);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n > 1 && n <= 13) return `In ${n} days`;
  if (n < -1 && n >= -6) return `${-n} days ago`;
  return shortDate(iso);
}

/** "3:30 PM" from a Postgres time ("15:30:00"). */
export function timeText(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
}
