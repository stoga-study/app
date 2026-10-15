import { useState } from "react";
import { cn } from "@/lib/cn";
import { shortDate, weekdayLetters } from "@/lib/calendar";
import type { DayTotal, HeatCell, WeekPoint } from "@/lib/history";
import { weekStart } from "@/lib/locale";

// One hue, light to dark (sequential): how much was studied that day. Level 0 is the empty track.
const SHADE = ["var(--line)", "color-mix(in srgb, var(--primary) 28%, var(--card))", "color-mix(in srgb, var(--primary) 50%, var(--card))", "color-mix(in srgb, var(--primary) 75%, var(--card))", "var(--primary)"];

export function describeDay(day: string, t: DayTotal) {
  if (!t.activity) return `${shortDate(day)}: no studying`;
  const parts = [t.reviews && `${t.reviews} card${t.reviews === 1 ? "" : "s"}`, t.quiz && `${t.quiz} quiz answer${t.quiz === 1 ? "" : "s"}`, t.tests && `${t.tests} practice-test question${t.tests === 1 ? "" : "s"}`, t.tutor && `${t.tutor} tutor question${t.tutor === 1 ? "" : "s"}`].filter(Boolean);
  return `${shortDate(day)}: ${parts.join(", ")}`;
}

/** A study heatmap: one column per week, one square per day. Hover or tap a day for what was done. */
export function Heatmap({ weeks, summary }: { weeks: HeatCell[][]; summary: string }) {
  const [hover, setHover] = useState<HeatCell | null>(null);
  const letters = weekdayLetters(weekStart());
  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className="grid grid-rows-7 gap-[3px] pt-0 text-[0.6875rem] font-bold leading-none text-muted" aria-hidden="true">
          {letters.map((l, i) => <span key={i} className={cn("flex h-3.5 items-center", i % 2 && "invisible")}>{l}</span>)}
        </div>
        <div className="flex gap-[3px]" role="img" aria-label={summary} onMouseLeave={() => setHover(null)}>
          {weeks.map((w) => (
            <div key={w[0].day} className="grid grid-rows-7 gap-[3px]">
              {w.map((c) => (
                <button
                  key={c.day}
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  disabled={c.future}
                  onMouseEnter={() => setHover(c)}
                  onClick={() => setHover(c)}
                  className={cn("size-3.5 rounded-[3px] transition-transform hover:scale-125", c.future && "opacity-0", hover?.day === c.day && "ring-2 ring-ink ring-offset-1 ring-offset-card")}
                  style={{ background: SHADE[c.level] }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[0.8125rem] text-muted">
        <p aria-live="polite" className="min-h-5 font-bold text-ink-2">{hover ? describeDay(hover.day, hover.total) : "Tap a day to see what you did."}</p>
        <span className="flex items-center gap-1" aria-hidden="true">
          Less {SHADE.map((s, i) => <span key={i} className="size-3 rounded-[3px]" style={{ background: s }} />)} More
        </span>
      </div>
    </div>
  );
}

/**
 * A weekly percentage as a thin line (0 to 100%), gaps where a week had too few answers. Hover or tap
 * for the week's number; the latest value is labelled at the end.
 */
export function TrendLine({ points, label }: { points: WeekPoint[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 280, H = 96, PAD = 6;
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(1, points.length - 1);
  const y = (pct: number) => PAD + ((100 - pct) * (H - 2 * PAD)) / 100;
  // Line segments only between weeks that both have a value.
  const segs: string[] = [];
  points.forEach((p, i) => {
    if (p.pct == null) return;
    const prev = points[i - 1];
    segs.push(`${prev?.pct != null ? "L" : "M"}${x(i).toFixed(1)} ${y(p.pct).toFixed(1)}`);
  });
  const shown = hover != null ? points[hover] : [...points].reverse().find((p) => p.pct != null);
  const any = points.some((p) => p.pct != null);
  return (
    <figure className="m-0">
      <div className="flex items-baseline justify-between gap-2">
        <figcaption className="font-bold">{label}</figcaption>
        <span className="big-num text-[1.75rem] tabular">{shown?.pct != null ? `${shown.pct}%` : "–"}</span>
      </div>
      <p className="min-h-5 text-[0.8125rem] text-muted" aria-live="polite">
        {!any ? "Not enough answers yet." : shown ? `Week of ${shortDate(shown.start)}${shown.pct != null ? `: ${shown.n} answers` : ": too few answers"}` : ""}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-24 w-full overflow-visible" role="img" aria-label={`${label}, weekly: ${points.map((p) => (p.pct == null ? "no data" : `${p.pct}%`)).join(", ")}`} onMouseLeave={() => setHover(null)}>
        {[0, 50, 100].map((g) => <line key={g} x1={PAD} x2={W - PAD} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeWidth={1} strokeDasharray={g === 50 ? "3 4" : undefined} />)}
        <path d={segs.join(" ")} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => p.pct != null && (
          <circle key={i} cx={x(i)} cy={y(p.pct)} r={hover === i ? 5 : 3.5} fill="var(--primary)" stroke="var(--card)" strokeWidth={2} />
        ))}
        {/* Hit areas wider than the marks. */}
        {points.map((_, i) => (
          <rect key={i} x={x(i) - (W - 2 * PAD) / Math.max(1, points.length - 1) / 2} y={0} width={(W - 2 * PAD) / Math.max(1, points.length - 1)} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD} y2={H - PAD} stroke="var(--line-strong)" strokeWidth={1} />}
      </svg>
    </figure>
  );
}
