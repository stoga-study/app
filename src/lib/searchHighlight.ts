/** Splits a ts_headline() snippet ("...<b>term</b>...") into plain and matched parts, for safe
 * rendering (never dangerouslySetInnerHTML: the snippet is server text, not trusted markup). */
export function highlightParts(text: string): { text: string; mark: boolean }[] {
  const out: { text: string; mark: boolean }[] = [];
  const re = /<b>([^<]*)<\/b>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), mark: false });
    out.push({ text: m[1], mark: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), mark: false });
  return out;
}
