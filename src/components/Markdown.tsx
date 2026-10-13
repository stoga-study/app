import { Fragment, type ReactNode } from "react";
import { mathNodes } from "./MathText";

// A small, safe renderer for study text: paragraphs, headings (#), "- " bullets, "1." lists, "- [ ]" checklists
// and **bold**.
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

type Block =
  | { kind: "h"; level: number; text: string }
  | { kind: "ul" | "ol" | "p"; lines: string[] }
  | { kind: "check"; items: { done: boolean; text: string }[] };

const BULLET = /^\s*[-*•]\s+/, NUMBER = /^\s*\d+[.)]\s+/, CHECKBOX = /^\s*[-*]\s+\[([ xX])\]\s?/, HEADING = /^(#{1,3})\s+/;

/** Lines into blocks: headings, bullet, numbered and check lists, and paragraphs (split by blank lines). */
export function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const last = out[out.length - 1];
    if (!line.trim()) {
      out.push({ kind: "p", lines: [] });
      continue;
    }
    const h = HEADING.exec(line);
    const c = CHECKBOX.exec(line);
    if (h) out.push({ kind: "h", level: h[1].length, text: line.slice(h[0].length) });
    else if (c) {
      const item = { done: c[1] !== " ", text: line.slice(c[0].length) };
      if (last?.kind === "check") last.items.push(item);
      else out.push({ kind: "check", items: [item] });
    } else {
      const kind = BULLET.test(line) ? "ul" : NUMBER.test(line) ? "ol" : "p";
      const body = line.replace(kind === "ul" ? BULLET : kind === "ol" ? NUMBER : /^/, "");
      if (last && last.kind === kind) last.lines.push(body);
      else out.push({ kind, lines: [body] });
    }
  }
  return out.filter((b) => b.kind !== "p" || b.lines.length);
}

/**
 * Notes as formatted text. `onCheck(n)` makes checklist boxes tappable (n counts boxes in reading
 * order); without it they are shown read-only.
 */
export function Markdown({ text, className, cite, onCheck }: { text: string; className?: string; cite?: CiteRenderer; onCheck?: (n: number) => void }) {
  let box = 0;
  return (
    <div className={className}>
      {blocks(text).map((b, i) => {
        if (b.kind === "h") {
          const Tag = b.level === 1 ? "h3" : b.level === 2 ? "h4" : "h5";
          return <Tag key={i} className={`mb-1 mt-4 font-display font-bold text-ink first:mt-0 ${b.level === 1 ? "text-[1.25rem]" : b.level === 2 ? "text-[1.125rem]" : "text-[1rem]"}`}>{inline(b.text, cite)}</Tag>;
        }
        if (b.kind === "ul") return <ul key={i} className="my-2 list-disc space-y-1.5 pl-5">{b.lines.map((l, j) => <li key={j}>{inline(l, cite)}</li>)}</ul>;
        if (b.kind === "ol") return <ol key={i} className="my-2 list-decimal space-y-1.5 pl-5">{b.lines.map((l, j) => <li key={j}>{inline(l, cite)}</li>)}</ol>;
        if (b.kind === "check")
          return (
            <ul key={i} className="my-2 space-y-1.5">
              {b.items.map((it, j) => {
                const n = box++;
                return (
                  <li key={j} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 flex-none accent-primary"
                      checked={it.done}
                      readOnly={!onCheck}
                      disabled={!onCheck}
                      aria-label={it.text || "Checklist item"}
                      onChange={() => onCheck?.(n)}
                    />
                    <span className={it.done ? "text-muted line-through" : undefined}>{inline(it.text, cite)}</span>
                  </li>
                );
              })}
            </ul>
          );
        return <p key={i} className="my-2">{inline(b.lines.join(" "), cite)}</p>;
      })}
    </div>
  );
}
