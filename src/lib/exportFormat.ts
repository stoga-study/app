// Formats for the data export: CSV, Anki, iCalendar and safe file names. Pure, unit tested.

/** One CSV field: quoted when it has a comma, quote or line break. */
export const csvField = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const csvRow = (fields: unknown[]) => fields.map(csvField).join(",");

/** Anki's plain-text import: tab between front and back (and tags); line breaks as <br>. */
export const ankiLine = (front: string, back: string, tags: string[] = []) =>
  [front, back, tags.join(" ")].map((x) => x.replace(/\t/g, " ").replace(/\r?\n/g, "<br>")).join("\t");

/** A name safe for a file or folder on any computer. */
export const safeName = (s: string, fallback = "untitled") => s.normalize("NFKC").replace(/[\\/:*?"<>|\p{Cc}]+/gu, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "").slice(0, 80) || fallback;

/** Different names for things with the same title ("Notes", "Notes (2)"). */
export function uniqueNamer() {
  const used = new Map<string, number>();
  return (name: string) => {
    const key = name.toLowerCase();
    const n = (used.get(key) ?? 0) + 1;
    used.set(key, n);
    return n === 1 ? name : `${name} (${n})`;
  };
}

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** The calendar as an .ics file other calendar apps can import. */
export function toIcs(events: { id: string; title: string; kind: string; due_on: string; due_time: string | null; notes: string | null; className?: string | null }[]) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Stoga.study//Export//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Stoga.study"];
  for (const e of events) {
    const d = e.due_on.replace(/-/g, "");
    lines.push("BEGIN:VEVENT", `UID:${e.id}@stoga.study`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`);
    if (e.due_time) lines.push(`DTSTART:${d}T${e.due_time.slice(0, 5).replace(":", "")}00`);
    else lines.push(`DTSTART;VALUE=DATE:${d}`);
    lines.push(`SUMMARY:${icsText(e.title)}`, `CATEGORIES:${icsText([e.kind, e.className].filter(Boolean).join(","))}`);
    if (e.notes) lines.push(`DESCRIPTION:${icsText(e.notes)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
