import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Brand } from "@/components/Brand";
import { cn } from "@/lib/cn";

/**
 * The frame for getting started (welcome, sign-in, onboarding). Phones: one column, as before. Tablets: a roomier
 * column with the brand on top. Desktop: a split screen, with the brand and where you are on the left.
 */
export function SetupFrame({ children, steps, current, title = "Made for Conestoga, down to your schedule.", note }: {
  children: ReactNode;
  /** The setup steps, shown on desktop with the current one marked. */
  steps?: string[];
  /** 0-based index of the current step; steps.length means all done. */
  current?: number;
  title?: string;
  note?: string;
}) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(24rem,40%)_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col justify-between border-r border-line bg-card px-12 py-12 lg:flex" aria-label="Stoga.study">
        <Brand />
        <div>
          <p className="eyebrow">Getting set up</p>
          <p className="mt-3 max-w-[18ch] font-display text-[2.75rem] leading-[1.04] tracking-[-0.02em] text-ink">{title}</p>
          {steps && (
            <ol className="mt-10 flex flex-col gap-1">
              {steps.map((s, i) => {
                const done = current !== undefined && i < current;
                const now = i === current;
                return (
                  <li key={s} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0" aria-current={now ? "step" : undefined}>
                    <span className={cn("grid size-6 flex-none place-items-center rounded-full font-mono text-[0.75rem]", done ? "bg-primary text-[var(--on-fill)]" : now ? "border border-ink text-ink" : "border border-line-strong text-muted")}>
                      {done ? <Check className="size-3.5" aria-hidden="true" /> : i + 1}
                    </span>
                    <span className={cn("text-[0.9375rem]", now ? "font-semibold text-ink" : done ? "text-ink-2" : "text-muted")}>{s}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        <p className="text-[0.875rem] text-muted">{note ?? "Free for every Conestoga student. Private by default."}</p>
      </aside>
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-8 md:px-10 md:pt-12 lg:max-w-3xl lg:px-16 lg:pt-16">
        <div className="lg:hidden md:mb-2">
          <Brand descriptor={false} />
        </div>
        {children}
      </main>
    </div>
  );
}
