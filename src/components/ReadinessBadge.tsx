import { CircleCheck, CircleDashed, CircleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Readiness } from "@/lib/readiness";

const ICON = { ready: <CircleCheck />, getting: <CircleDashed />, needs: <CircleAlert /> };

/** "Ready", "Getting there" or "Needs work", with the reason beside it (or in the label when compact). */
export function ReadinessBadge({ r, onDark, compact }: { r: Readiness | null | undefined; onDark?: boolean; compact?: boolean }) {
  if (!r) return null;
  const tone = onDark
    ? r.level === "ready" ? "bg-white text-[#720D19]" : "bg-white/15 text-white"
    : r.level === "ready" ? "bg-primary text-[var(--on-fill)]" : r.level === "getting" ? "bg-tint text-brand" : "border-2 border-hot bg-card text-hot";
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1" title={compact ? r.reason : undefined}>
      <span className={cn("inline-flex min-h-7 items-center gap-1 rounded-full px-2.5 text-[0.8125rem] font-bold [&_svg]:size-4", tone)} aria-label={compact ? `${r.label}: ${r.reason}` : undefined}>
        {ICON[r.level]} {r.label}
      </span>
      {!compact && <span className={cn("text-[0.875rem]", onDark ? "text-[#F7EAEC]" : "text-muted")}>{r.reason}</span>}
    </span>
  );
}
