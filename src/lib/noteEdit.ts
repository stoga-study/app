// Toolbar edits for your own notes. Pure: each takes the text and selection and returns the new
// text and selection, so the editor stays a plain textarea (fast, offline, works with every keyboard).

export type Edit = { text: string; start: number; end: number };

/** Bold (or any mark): wraps the selection, or unwraps it if it is already wrapped. */
export function wrap({ text, start, end }: Edit, mark = "**"): Edit {
  const before = text.slice(0, start), sel = text.slice(start, end), after = text.slice(end);
  if (before.endsWith(mark) && after.startsWith(mark))
    return { text: before.slice(0, -mark.length) + sel + after.slice(mark.length), start: start - mark.length, end: end - mark.length };
  if (sel.length > 2 * mark.length && sel.startsWith(mark) && sel.endsWith(mark))
    return { text: before + sel.slice(mark.length, -mark.length) + after, start, end: end - 2 * mark.length };
  return { text: before + mark + sel + mark + after, start: start + mark.length, end: end + mark.length };
}

/** Line starts the toolbar manages; one replaces another ("- " becomes "- [ ] "). */
const PREFIX = /^(#{1,3} |- \[[ xX]\] |[-*•] |\d+[.)] )/;

/**
 * Heading, bullet or checklist: applies the prefix to every line the selection touches, or removes it
 * when every one of them already has it.
 */
export function toggleLines({ text, start, end }: Edit, prefix: string): Edit {
  const from = text.lastIndexOf("\n", start - 1) + 1;
  const nl = text.indexOf("\n", Math.max(end - (end > start && text[end - 1] === "\n" ? 1 : 0), start));
  const to = nl === -1 ? text.length : nl;
  const lines = text.slice(from, to).split("\n");
  const all = lines.every((l) => l.startsWith(prefix) || !l.trim());
  const next = lines.map((l) => (!l.trim() && lines.length > 1 ? l : all ? l.slice(prefix.length) : prefix + l.replace(PREFIX, "")));
  const block = next.join("\n");
  const firstShift = next[0].length - lines[0].length;
  return {
    text: text.slice(0, from) + block + text.slice(to),
    start: Math.max(from, start + firstShift),
    end: end + (block.length - (to - from)),
  };
}

/** Types `s` over the selection (symbols from the math palette). */
export function insert({ text, start, end }: Edit, s: string): Edit {
  return { text: text.slice(0, start) + s + text.slice(end), start: start + s.length, end: start + s.length };
}

const CHECK = /^(\s*- \[)([ xX])(\] )/gm;

/** Ticks or unticks the nth checklist item (0-based, in reading order). */
export function toggleCheck(text: string, n: number): string {
  let i = 0;
  return text.replace(CHECK, (m, a: string, x: string, b: string) => (i++ === n ? a + (x === " " ? "x" : " ") + b : m));
}

/** A note's title, or its first line, or "Untitled note". */
export function noteTitle(n: { title: string; body: string }) {
  if (n.title.trim()) return n.title.trim();
  const first = n.body.split("\n").map((l) => l.replace(PREFIX, "").replace(/\*\*/g, "").trim()).find(Boolean);
  return first ? first.slice(0, 60) : "Untitled note";
}

/** A one-line look inside, for lists. */
export function notePreview(body: string, max = 110) {
  const flat = body.replace(/^(#{1,3} |- \[[ xX]\] |[-*•] |\d+[.)] )/gm, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max).replace(/\s+\S*$/, "") + "…" : flat;
}
