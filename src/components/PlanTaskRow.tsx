import { BookOpen, Check, Layers, ListChecks, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/cn";
import type { PlanTask, TaskKind } from "@/lib/plan";
import { useTogglePlanDone } from "@/lib/queries/plan";

const ICON: Record<TaskKind, ReactNode> = { review: <Layers />, mistakes: <RotateCcw />, quiz: <ListChecks />, guide: <BookOpen /> };

/** One study-plan task. Today's can be ticked off (card review ticks itself); later days are a preview. */
export function PlanTaskRow({ t, today }: { t: PlanTask; today: boolean }) {
  const toggle = useTogglePlanDone();
  return (
    <li className="flex items-center gap-3 py-2.5">
      {today ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={t.done}
          aria-label={`${t.done ? "Mark not done" : "Mark done"}: ${t.title}`}
          onClick={() => toggle.mutate({ key: t.key, done: !t.done })}
          className={cn("grid size-11 flex-none place-items-center rounded-full border-2 [&_svg]:size-5", t.done ? "border-primary bg-primary text-[var(--on-fill)]" : "border-line-strong bg-card text-transparent")}
        >
          <Check />
        </button>
      ) : (
        <span className="tile soft flex-none" aria-hidden="true">{ICON[t.kind]}</span>
      )}
      <Link to={t.href} className="min-w-0 flex-1 text-ink no-underline">
        <span className={cn("block truncate font-bold", t.done && "text-muted line-through")}>{t.title}</span>
        <span className="block truncate text-[0.875rem] text-muted">For {t.examTitle} · about {t.minutes} min</span>
      </Link>
    </li>
  );
}
