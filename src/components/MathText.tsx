import { Fragment, type ReactNode } from "react";

// Browsers draw combining marks (x̄ = x + U+0304, p̂ = p + U+0302) over the following space in most
// fonts, so "x̄ is" reads as "x̄is". Render them with CSS instead: an overline, or a positioned hat.
const MARKED = /(\p{L})([̂̄])/gu;

export function mathNodes(text: string, keyPrefix = "m"): ReactNode[] {
  if (!/[̂̄]/.test(text)) return [text];
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MARKED)) {
    if (m.index! > last) out.push(<Fragment key={`${keyPrefix}${last}`}>{text.slice(last, m.index)}</Fragment>);
    out.push(
      m[2] === "̄" ? (
        <span key={`${keyPrefix}${m.index}`} className="math-bar" aria-label={`${m[1]} bar`}>{m[1]}</span>
      ) : (
        <span key={`${keyPrefix}${m.index}`} className="math-hat" aria-label={`${m[1]} hat`}>{m[1]}</span>
      ),
    );
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(<Fragment key={`${keyPrefix}end`}>{text.slice(last)}</Fragment>);
  return out;
}

/** Plain generated text with correctly drawn x̄ and p̂. */
export function MathText({ text }: { text: string }) {
  return <>{mathNodes(text)}</>;
}
