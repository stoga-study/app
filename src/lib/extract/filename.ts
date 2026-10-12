// Turns raw filenames into readable titles on the device, before anything is saved:
// "U2L6+Notes+Equations+with+Radicals+and+Rational+Exponents+ANSWERS.pdf"
//   → "Lesson 6: Equations with Radicals and Rational Exponents (Answers)" (shortened to fit)
// An AI pass may refine it afterwards; this is the instant, offline fallback.

export const TITLE_MAX = 50;

const ACRONYMS = new Set([
  "AP", "IB", "US", "USA", "UK", "UN", "EU", "DNA", "RNA", "ATP", "PH", "WWI", "WWII", "SAT", "ACT", "PSAT",
  "FRQ", "MCQ", "DBQ", "LEQ", "SAQ", "MLA", "APA", "GDP", "CS", "PE", "AB", "BC", "STEM", "CHS", "II", "III",
  "IV", "VI", "VII", "VIII", "IX", "XI", "XII", "MC", "SI", "APUSH", "APWH", "APES", "APCSA", "APCSP", "APLAC", "IMG",
]);
const MINOR = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "of", "on", "or", "per", "the", "to", "vs", "via", "with"]);
const ANSWERS = /\b(answer\s*key|answers?|ans\s*key|key|solutions?|ans)\b/gi;

function caseWord(w: string, first: boolean): string {
  if (!/[a-z]/i.test(w)) return w; // numbers, symbols
  const bare = w.replace(/[^A-Za-z]/g, "");
  if (w === "Act") return w;
  if (ACRONYMS.has(bare.toUpperCase()) && (bare === bare.toUpperCase() || bare.length <= 3)) return w.toUpperCase();
  if (/[a-z][A-Z]/.test(w)) return w; // iPhone, McCarthy: leave deliberate casing alone
  const lower = w.toLowerCase();
  if (!first && MINOR.has(lower)) return lower;
  return lower.replace(/^([^a-z]*)([a-z])/, (_, pre, c) => pre + c.toUpperCase()).replace(/-([a-z])/g, (_, c) => "-" + c.toUpperCase());
}

/** Readable, mid-length title from a raw filename. */
export function prettyFilename(raw: string, max = TITLE_MAX): string {
  let s = raw.replace(/\.[a-z0-9]{1,5}$/i, "");
  try {
    s = decodeURIComponent(s);
  } catch {
    /* not URI-encoded */
  }
  s = s.replace(/[+_]+/g, " ");
  if (!/\s/.test(s.trim())) s = s.replace(/-+/g, " "); // "unit-2-notes"
  s = s.replace(/^\s*(copy of\s+)+/i, "").replace(/\s*\(\d+\)\s*$/, "").replace(/\s+\b(final|copy|v\d+)\b\s*$/i, "");

  // Shorthand before anything splits it: U2L6, Unit2Lesson6, Ch3, Wk5, HW, Lec4.
  s = s
    .replace(/\bU(?:nit)?\s*(\d+)\s*[-.]?\s*L(?:esson)?\s*(\d+)\b/gi, "Unit $1, Lesson $2")
    .replace(/\bU(?:nit)?\s*(\d+)\b/gi, "Unit $1")
    .replace(/\bL(?:esson)?\s*(\d+)\b/gi, "Lesson $1")
    .replace(/\bCh(?:apter|apt|\.)?\s*(\d+)\b/gi, "Chapter $1")
    .replace(/\b(?:Wk|Week)\s*(\d+)\b/gi, "Week $1")
    .replace(/\bLec(?:ture)?\s*(\d+)\b/gi, "Lecture $1")
    .replace(/\bSec(?:tion)?\s*(\d+(?:\.\d+)*)\b/gi, "Section $1")
    .replace(/\bHW\b/gi, "Homework");
  // camelCase and letter/number joins: "Week5Sampling" → "Week 5 Sampling".
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Za-z]{2,})(\d)/g, "$1 $2");

  let answers = false;
  s = s.replace(ANSWERS, () => {
    answers = true;
    return " ";
  });

  // A "Unit 2, Lesson 6" style prefix becomes "Unit 2, Lesson 6: topic".
  let prefix = "";
  const m = s.match(/^\s*((?:Unit|Lesson|Chapter|Week|Lecture|Section)\s+[\d.]+(?:,\s*(?:Lesson|Section)\s+[\d.]+)?)\s*[:\-–]?\s*(.*)$/i);
  if (m) {
    prefix = m[1];
    s = m[2];
  }
  s = s.replace(/\bACT\s+(\d+)/gi, "Act $1"); // a play's act, not the test
  let words = s.split(/\s+/).filter(Boolean);
  // "Notes" adds nothing when there is a real topic.
  if (words.length > 1) words = words.filter((w, i) => !(i === 0 && /^notes?$/i.test(w)));
  let topic = words.map((w, i) => caseWord(w, i === 0)).join(" ").replace(/\s+([,.:;])/g, "$1").trim();
  topic = topic.replace(/^[,:;\-–\s]+|[,:;\-–\s]+$/g, "");

  const tag = answers ? " (Answers)" : "";
  const join = (p: string) => (p && topic ? `${p}: ${topic}` : p || topic);
  let title = join(prefix) + tag;
  if (title.length > max && prefix.includes(",")) title = join(prefix.split(",")[1].trim()) + tag; // keep the lesson, drop the unit
  if (title.length > max) {
    const head = (prefix.includes(",") ? prefix.split(",")[1].trim() : prefix);
    const room = max - tag.length - (head ? head.length + 2 : 0) - 1;
    let cut = "";
    for (const w of topic.split(" ")) {
      if ((cut ? cut.length + 1 : 0) + w.length > room) break;
      cut = cut ? `${cut} ${w}` : w;
    }
    cut = cut.replace(/\s+(?:and|with|of|the|for|to|in|on|a|an|or)$/i, "");
    title = (head && cut ? `${head}: ${cut}…` : head || `${cut}…`) + tag;
  }
  title = title.replace(/\s{2,}/g, " ").trim();
  return title.length >= 2 ? title : "Untitled notes";
}
