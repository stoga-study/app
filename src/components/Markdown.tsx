import { Fragment, type ReactNode } from "react";
import { mathNodes } from "./MathText";

// A small, safe renderer for generated study text: paragraphs, "- " bullets, "1." lists and **bold**.
// It builds React elements, never HTML strings, so generated text cannot inject markup.

export type CiteRenderer = (key: string, page: number, i: number) => ReactNode;
const CITE = /\[(S\d+)\s*(?:p\.?|pp\.?|page|part)?\s*(\d+)\]/gi;

function inline(text: string, cite?: CiteRenderer): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).flatMap((part, i): ReactNode[] => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return [<strong key={i}>{mathNodes(part.slice(2, -2), `b${i}-`)}</strong>];
    if (!cite) return [<Fragment key={i}>{mathNodes(part, `t${i}-`)}</Fragment>];
    // Citation markers like [S1 p.12] become chips.
    const out: ReactNode[] = [];
    let last = 0;
    for (const m of part.matchAll(CITE)) {
      out.push(<Fragment key={`${i}-${last}`}>{mathNodes(part.slice(last, m.index).replace(/\s+$/, " "), `c${i}-${last}-`)}</Fragment>);
      out.push(cite(m[1].toUpperCase(), Number(m[2]), m.index!));
      last = m.index! + m[0].length;
    }
    out.push(<Fragment key={`${i}-end`}>{mathNodes(part.slice(last), `e${i}-`)}</Fragment>);
    return out;
  });
}

export function Markdown({ text, className, cite }: { text: string; className?: string; cite?: CiteRenderer }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  return (
    <div className={className}>
      {blocks.map((block, b) => {
        const lines = block.split("\n").filter((l) => l.trim());
        if (lines.length && lines.every((l) => /^\s*[-*•]\s+/.test(l)))
          return (
            <ul key={b} className="my-2 list-disc space-y-1.5 pl-5">
              {lines.map((l, i) => <li key={i}>{inline(l.replace(/^\s*[-*•]\s+/, ""), cite)}</li>)}
            </ul>
          );
        if (lines.length && lines.every((l) => /^\s*\d+[.)]\s+/.test(l)))
          return (
            <ol key={b} className="my-2 list-decimal space-y-1.5 pl-5">
              {lines.map((l, i) => <li key={i}>{inline(l.replace(/^\s*\d+[.)]\s+/, ""), cite)}</li>)}
            </ol>
          );
        return <p key={b} className="my-2">{inline(lines.join(" "), cite)}</p>;
      })}
    </div>
  );
}
