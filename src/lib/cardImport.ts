// Bulk flashcard import: pasted "term - definition" lines, CSV, Quizlet's export and Anki's text
// export, told apart automatically. Pure, so every format is unit tested.

export type ImportedCard = { front: string; back: string };
export type ImportFormat = "anki" | "tabs" | "csv" | "lines";
export type ImportResult = { format: ImportFormat; cards: ImportedCard[]; skipped: number };

export const MAX_IMPORT = 1000;
const MAX_FRONT = 1000, MAX_BACK = 2000;

/** Anki exports can carry HTML: line breaks become newlines, tags go, entities decode. */
function stripHtml(s: string) {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

const clean = (s: string) => s.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

/** RFC 4180 CSV (quoted fields may hold commas, quotes and newlines), with a chosen delimiter. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim()));
}

const HEADER = /^(front|term|word|question|card ?front)$/i;
const HEADER_BACK = /^(back|definition|meaning|answer|card ?back)$/i;

function fromRows(rows: string[][], html: boolean): { cards: ImportedCard[]; skipped: number } {
  const cards: ImportedCard[] = [];
  let skipped = 0;
  rows.forEach((r, i) => {
    if (i === 0 && HEADER.test(r[0]?.trim() ?? "") && HEADER_BACK.test(r[1]?.trim() ?? "")) return;
    const front = clean(html ? stripHtml(r[0] ?? "") : r[0] ?? "");
    const back = clean(html ? stripHtml(r[1] ?? "") : r[1] ?? "");
    if (!front || !back) { skipped++; return; }
    cards.push({ front: front.slice(0, MAX_FRONT), back: back.slice(0, MAX_BACK) });
  });
  return { cards, skipped };
}

/** One "term - definition" per line: an en or em dash, a spaced hyphen, a colon, or " = ". */
function fromLines(text: string): { cards: ImportedCard[]; skipped: number } {
  const cards: ImportedCard[] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();
    if (!line) continue;
    const m = /^(.+?)\s*(?:\s[–—-]\s|[–—]|:\s|\s=\s)\s*(.+)$/.exec(line);
    if (!m || !m[1].trim() || !m[2].trim()) { skipped++; continue; }
    cards.push({ front: clean(m[1]).slice(0, MAX_FRONT), back: clean(m[2]).slice(0, MAX_BACK) });
  }
  return { cards, skipped };
}

/** Works out the format and reads every card it can; lines it cannot split are counted, not guessed. */
export function parseCardImport(input: string, fileName = ""): ImportResult {
  const text = input.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { format: "lines", cards: [], skipped: 0 };

  // Anki: "#separator:tab" (or comma/semicolon) and other "#key:value" headers, maybe HTML.
  if (/^#(separator|html|notetype|deck|tags column|columns):/im.test(text)) {
    const sep = /^#separator:(\w+)/im.exec(text)?.[1]?.toLowerCase();
    const delimiter = sep === "comma" ? "," : sep === "semicolon" ? ";" : sep === "pipe" ? "|" : "\t";
    const body = text.split(/\r?\n/).filter((l) => !/^#[\w ]+:/.test(l)).join("\n");
    const html = !/^#html:false/im.test(text);
    const r = fromRows(parseDelimited(body, delimiter), html);
    return { format: "anki", ...cap(r) };
  }

  // Tabs: Quizlet's default export, Anki without headers, a spreadsheet copied and pasted.
  const tabbed = lines.filter((l) => l.includes("\t")).length;
  if (tabbed >= Math.max(1, lines.length * 0.6)) {
    const r = fromRows(parseDelimited(text, "\t"), /<br|<div|<b>|&nbsp;/i.test(text));
    return { format: "tabs", ...cap(r) };
  }

  // CSV: a .csv file, or most lines split into two or more comma fields.
  if (/\.csv$/i.test(fileName) || lines.filter((l) => parseDelimited(l, ",")[0]?.length >= 2 && !/\s[–—-]\s/.test(l)).length >= Math.max(1, lines.length * 0.8)) {
    const r = fromRows(parseDelimited(text, ","), false);
    if (r.cards.length) return { format: "csv", ...cap(r) };
  }

  return { format: "lines", ...cap(fromLines(text)) };
}

function cap(r: { cards: ImportedCard[]; skipped: number }) {
  return r.cards.length > MAX_IMPORT ? { cards: r.cards.slice(0, MAX_IMPORT), skipped: r.skipped + r.cards.length - MAX_IMPORT } : r;
}
