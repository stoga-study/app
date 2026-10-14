// Turns pdf.js's flat text items into reading-order text that respects a two-column layout and marks
// headings, instead of pdf.js's own stream order (which can interleave two columns line by line) or
// flat concatenation (which loses which lines are headings). Pure and position-only, so it runs in
// unit tests with hand-built items, no real PDF needed.

export type TextItem = { str: string; x: number; y: number; height: number; hasEOL: boolean };
type Line = { x: number; y: number; height: number; text: string };

function toLine(buf: TextItem[]): Line | null {
  const text = buf.map((i) => i.str).join("");
  if (!text.trim()) return null;
  return { x: Math.min(...buf.map((i) => i.x)), y: buf[0].y, height: Math.max(...buf.map((i) => i.height)), text };
}

/** Lines from a stream of items still in reading order, using pdf.js's own hasEOL: right for normal
 * flowing text, where consecutive items are really the same or the next line. */
function linesFromEOL(items: TextItem[]): Line[] {
  const lines: Line[] = [];
  let buf: TextItem[] = [];
  for (const it of items) {
    buf.push(it);
    if (it.hasEOL) {
      const l = toLine(buf);
      if (l) lines.push(l);
      buf = [];
    }
  }
  const last = toLine(buf);
  if (last) lines.push(last);
  return lines;
}

/** Lines from a stream of items that came from filtering a column out of the full page: hasEOL no
 * longer means anything (it reflects the unfiltered page, where the next item may have been the other
 * column's, at a similar y), so a new line starts whenever y actually moves instead. */
function linesFromYChange(items: TextItem[]): Line[] {
  const lines: Line[] = [];
  let buf: TextItem[] = [];
  let refY: number | null = null;
  for (const it of items) {
    if (refY !== null && Math.abs(it.y - refY) > Math.max(2, it.height * 0.4)) {
      const l = toLine(buf);
      if (l) lines.push(l);
      buf = [];
    }
    buf.push(it);
    refY = it.y;
  }
  const last = toLine(buf);
  if (last) lines.push(last);
  return lines;
}

/** A page-wide x split, only on a clear, well-placed gutter with real content on both sides. */
function findColumnSplit(items: TextItem[], pageWidth: number): number | null {
  if (items.length < 6 || !pageWidth) return null;
  const xs = [...new Set(items.map((i) => Math.round(i.x)))].sort((a, b) => a - b);
  let bestGap = 0, splitX = -1;
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - xs[i - 1];
    if (gap > bestGap) { bestGap = gap; splitX = (xs[i - 1] + xs[i]) / 2; }
  }
  if (splitX < pageWidth * 0.25 || splitX > pageWidth * 0.75 || bestGap < pageWidth * 0.08) return null;
  const left = items.filter((i) => i.x < splitX).length;
  if (left < 3 || items.length - left < 3) return null;
  return splitX;
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

/** One page's items into text: two-column order when a clear gutter is found (left column fully, top
 * to bottom, then right column), short oversized lines marked as "## " headings. */
export function reconstructPage(items: TextItem[], pageWidth: number): string {
  if (!items.length) return "";
  const splitX = findColumnSplit(items, pageWidth);
  const lines = splitX === null
    ? linesFromEOL(items)
    : [
        ...linesFromYChange(items.filter((i) => i.x < splitX)).sort((a, b) => b.y - a.y),
        ...linesFromYChange(items.filter((i) => i.x >= splitX)).sort((a, b) => b.y - a.y),
      ];
  if (!lines.length) return "";
  const body = modeHeight(lines);
  return lines
    .map((l) => (body > 0 && l.height >= body * 1.3 && l.text.trim().length > 0 && l.text.trim().length <= 80 ? `## ${l.text.trim()}` : l.text))
    .join("\n");
}
