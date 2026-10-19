import { CircleCheck, CircleDashed, CircleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Readiness } from "@/lib/readiness";

const ICON = { ready: <CircleCheck />, getting: <CircleDashed />, needs: <CircleAlert /> };

/** "Ready", "Getting there" or "Needs work", with the reason beside it (or in the label when compact). */
export function ReadinessBadge({ r, onDark, compact }: { r: Readiness | null | undefined; onDark?: boolean; compact?: boolean }) {
  if (!r) return null;
  // onDark is kept for callers written for the old dark panels; panels are light now, so it changes nothing.
  void onDark;
  const tone = r.level === "ready" ? "bg-tint text-brand" : r.level === "getting" ? "bg-soft text-ink-2" : "border border-hot bg-card text-hot";
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1" title={compact ? r.reason : undefined}>
      <span className={cn("inline-flex min-h-6 items-center gap-1 rounded-full px-2 text-[0.75rem] font-semibold [&_svg]:size-3.5", tone)} aria-label={compact ? `${r.label}: ${r.reason}` : undefined}>
        {ICON[r.level]} {r.label}
      </span>
      {!compact && <span className="text-[0.8125rem] text-muted">{r.reason}</span>}
    </span>
  );
}
