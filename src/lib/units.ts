// Finding the unit a file belongs to, from its name and first page. Pure, so it is unit tested.

export type UnitLabel = {
  /** The unit, e.g. "11" (for "Unit 11.1"), "7" (for "Chapter 7"). */
  number: string;
  /** The lesson inside it, e.g. "11.1", or null. */
  lesson: string | null;
  /** A title found next to the label ("Unit 11: The French Revolution"), or null. */
  title: string | null;
  /** The word the file used, for display ("Unit", "Chapter", "Module"…). */
  word: string;
};

const WORDS: [RegExp, string][] = [
  [/\bunit/i, "Unit"], [/\bch(apter|\.)?/i, "Chapter"], [/\bmodule/i, "Module"], [/\btopic/i, "Topic"], [/\blesson/i, "Lesson"],
];

/** "The French Revolution (1789–1799)" from "Unit 11: The French Revolution (1789–1799)". */
function titleAfter(rest: string): string | null {
  const t = rest
    .replace(/^\s*(lesson|l)\s*\d+(\.\d+)?/i, "")
    // Extra lessons in one file ("U2L6 + U2L7 …", "Unit 3 & 4 …") are not part of the title.
    .replace(/^(\s*([+&,]|and)\s*(u\s?\d{1,2}\s?l\s?\d{1,2}|\d{1,2}(\.\d{1,2})?))+/i, "")
    .replace(/^[\s:–—\-.,|]+/, "")
    .split(/\n|\s{2,}|\s[|•]\s/)[0]
    .replace(/\.(pdf|docx?|pptx?|txt|md|jpe?g|png|heic)$/i, "")
    .replace(/[_]+/g, " ")
    .trim();
  if (t.length < 3 || /^\d+$/.test(t) || /^(notes?|slides?|worksheet|handout|review|packet|pdf)$/i.test(t)) return null;
  return t.slice(0, 60).replace(/\s+\S*$/, (m) => (t.length > 60 ? "" : m)).trim() || null;
}

/**
 * Find a unit label. Looks at the file name first, then the start of the first page.
 * Understands "Unit 11", "Unit 11.1", "U2L6" (unit 2, lesson 6), "Chapter 7", "Ch. 7", "Ch7", "Module 3",
 * "Topic 4", and "Lesson 5.2" (unit 5). Returns null when there is no clear label.
 */
export function findUnit(filename: string, firstPage = ""): UnitLabel | null {
  for (const raw of [filename, firstPage.slice(0, 1500)]) {
    const text = raw.replace(/[_]+/g, " ");
    // U2L6 / U2 L6 (common teacher shorthand): unit 2, lesson 6.
    const short = /\bU\s?(\d{1,2})\s?L\s?(\d{1,2})\b/i.exec(text);
    if (short) return { number: short[1], lesson: `${short[1]}.${short[2]}`, title: titleAfter(text.slice(short.index + short[0].length)), word: "Unit" };
    const m = /\b(unit|chapter|ch\.?|module|topic)\s*[#:]?\s*(\d{1,2})(?:\.(\d{1,2}))?\b/i.exec(text);
    if (m) {
      const word = WORDS.find(([re]) => re.test(m[1]))?.[1] ?? "Unit";
      return { number: m[2], lesson: m[3] ? `${m[2]}.${m[3]}` : null, title: titleAfter(text.slice(m.index + m[0].length)), word };
    }
    // "Lesson 5.2" names its unit; a bare "Lesson 6" does not.
    const lesson = /\blesson\s*(\d{1,2})\.(\d{1,2})\b/i.exec(text);
    if (lesson) return { number: lesson[1], lesson: `${lesson[1]}.${lesson[2]}`, title: titleAfter(text.slice(lesson.index + lesson[0].length)), word: "Unit" };
  }
  return null;
}

/** How a unit is shown: "Unit 11 · The French Revolution", or just the title, or "Unit 11". */
export function unitName(u: { number: string | null; title: string | null; word?: string | null }) {
  const label = u.number ? `${u.word ?? "Unit"} ${u.number}` : null;
  return label && u.title ? `${label} · ${u.title}` : label ?? u.title ?? "Unit";
}

/** Units in teaching order: by number, then units without a number by title. */
export function byNumber<T extends { number: string | null; title: string | null }>(a: T, b: T) {
  const na = a.number ? Number(a.number) : Infinity, nb = b.number ? Number(b.number) : Infinity;
  return na - nb || (a.title ?? "").localeCompare(b.title ?? "");
}
