import { FileText } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

/**
 * "p. 12" chips showing where something came from in the source. When a quote or a source is given,
 * tapping reveals the exact sentence that backs it (from the fact-check pass) and a link to the page.
 */
export function PageChips({ pages, kind, quote, sourceId }: { pages: number[]; kind: string; quote?: string | null; sourceId?: string | null }) {
  const [open, setOpen] = useState(false);
  if (!pages.length) return null;
  const label = kind === "pdf" || kind === "image" ? (pages.length === 1 ? "p." : "pp.") : pages.length === 1 ? "part" : "parts";
  const shown = pages.length > 4 ? `${pages.slice(0, 4).join(", ")}…` : pages.join(", ");
  const interactive = !!quote || !!sourceId;
  if (!interactive)
    return (
      <span className="source-chip mt-2" title={`From ${label} ${pages.join(", ")}`}>
        <FileText aria-hidden="true" />
        {label} {shown}
      </span>
    );
  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="source-chip mt-2" title={`From ${label} ${pages.join(", ")}`}>
        <FileText aria-hidden="true" />
        {label} {shown}
      </button>
      {open && (
        <div role="status" className="mt-2 max-w-sm rounded-[0.875rem] border-2 border-tint-line bg-tint p-3 text-[0.875rem]">
          {quote ? <p className="italic text-ink-2">&ldquo;{quote}&rdquo;</p> : <p className="text-muted">Open the page to check this against your notes.</p>}
          {sourceId && <Link to={`/sources/${sourceId}`} className="mt-1 inline-block font-bold text-brand">Open page →</Link>}
        </div>
      )}
    </>
  );
}
