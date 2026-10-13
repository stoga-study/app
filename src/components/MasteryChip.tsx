import type { Mastery } from "@/lib/mastery";

/** "Getting there" with a small bar; the details are in the label for screen readers. */
export function MasteryChip({ m, className = "" }: { m: Mastery | null; className?: string }) {
  if (!m) return null;
  const pct = Math.round(m.score * 100);
  const detail = `${m.label}, ${pct}%. ${m.mastered} of ${m.cards} cards mastered${m.quizPct != null ? `, quizzes ${m.quizPct}%` : ""}.`;
  return (
    <span className={`inline-flex items-center gap-2 text-[0.8125rem] font-bold text-muted ${className}`} role="img" aria-label={detail} title={detail}>
      <span className="bar !h-1.5 w-14" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
      {m.label}
    </span>
  );
}
