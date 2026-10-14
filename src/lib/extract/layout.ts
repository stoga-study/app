// Turns pdf.js's flat text items into reading-order text that respects a two-column layout and marks
// headings, instead of pdf.js's own stream order (which can interleave two columns line by line) or
// flat concatenation (which loses which lines are headings). Pure and position-only, so it runs in
// unit tests with hand-built items, no real PDF needed.

export type TextItem = { str: string; x: number; y: number; height: number; hasEOL: boolean };
type Line = { x: number; y: number; height: number; text: string };

function groupLines(items: TextItem[]): Line[] {
  const lines: Line[] = [];
  let buf: TextItem[] = [];
  const flush = () => {
    if (!buf.length) return;
    const text = buf.map((i) => i.str).join("");
    if (text.trim()) lines.push({ x: Math.min(...buf.map((i) => i.x)), y: buf[0].y, height: Math.max(...buf.map((i) => i.height)), text });
    buf = [];
  };
  for (const it of items) {
    buf.push(it);
    if (it.hasEOL) flush();
  }
  flush();
  return lines;
}

const byTopToBottom = (a: Line, b: Line) => b.y - a.y; // PDF y grows upward; top of page = larger y

/** Splits into two columns only on a clear, well-placed gutter with real content on both sides;
 * otherwise keeps pdf.js's own order untouched, since that is usually already correct. */
function splitColumns(lines: Line[], pageWidth: number): Line[] {
  if (lines.length < 6 || !pageWidth) return lines;
  const xs = [...new Set(lines.map((l) => l.x))].sort((a, b) => a - b);
  let bestGap = 0, splitX = -1;
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - xs[i - 1];
    if (gap > bestGap) { bestGap = gap; splitX = (xs[i - 1] + xs[i]) / 2; }
  }
  if (splitX < pageWidth * 0.25 || splitX > pageWidth * 0.75 || bestGap < pageWidth * 0.08) return lines;
  const left = lines.filter((l) => l.x < splitX).sort(byTopToBottom);
  const right = lines.filter((l) => l.x >= splitX).sort(byTopToBottom);
  if (left.length < 3 || right.length < 3) return lines;
  return [...left, ...right];
}

function modeHeight(lines: Line[]): number {
  const counts = new Map<number, number>();
  for (const l of lines) {
    const h = Math.round(l.height);
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  let best = lines[0] ? Math.round(lines[0].height) : 0, bestCount = 0;
  for (const [h, c] of counts) if (c > bestCount) { best = h; bestCount = c; }
  return best;
}

/** One page's items into text: two-column order when a clear gutter is found, short oversized lines
 * marked as "## " headings (the usual signal in body text: a noticeably bigger line, standing alone). */
export function reconstructPage(items: TextItem[], pageWidth: number): string {
  const lines = groupLines(items);
  if (!lines.length) return "";
  const ordered = splitColumns(lines, pageWidth);
  const body = modeHeight(lines);
  return ordered
    .map((l) => (body > 0 && l.height >= body * 1.3 && l.text.trim().length > 0 && l.text.trim().length <= 80 ? `## ${l.text.trim()}` : l.text))
    .join("\n");
}
