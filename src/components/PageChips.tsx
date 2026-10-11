import { FileText } from "lucide-react";

/** "p. 12" chips showing where something came from in the source. */
export function PageChips({ pages, kind }: { pages: number[]; kind: string }) {
  if (!pages.length) return null;
  const label = kind === "pdf" ? (pages.length === 1 ? "p." : "pp.") : pages.length === 1 ? "part" : "parts";
  const shown = pages.length > 4 ? `${pages.slice(0, 4).join(", ")}…` : pages.join(", ");
  return (
    <span className="source-chip mt-2" title={`From ${label} ${pages.join(", ")}`}>
      <FileText aria-hidden="true" />
      {label} {shown}
    </span>
  );
}
