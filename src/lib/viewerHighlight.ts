/** Splits a page's text around one quoted passage (case-insensitive, exact substring), for the
 * original-file viewer. Returns the whole text unmarked when there is no quote or no match. */
export function highlightQuote(text: string, quote: string | null | undefined): { text: string; mark: boolean }[] {
  const q = quote?.trim();
  if (!q) return [{ text, mark: false }];
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return [{ text, mark: false }];
  const out: { text: string; mark: boolean }[] = [];
  if (i > 0) out.push({ text: text.slice(0, i), mark: false });
  out.push({ text: text.slice(i, i + q.length), mark: true });
  if (i + q.length < text.length) out.push({ text: text.slice(i + q.length), mark: false });
  return out;
}
