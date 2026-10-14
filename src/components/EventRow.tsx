import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { timeText, whenText } from "@/lib/calendar";
import { isTask, useToggleDone, type CalEvent } from "@/lib/queries/events";
import { kindMeta } from "./EventForm";

/** One calendar item: a tick box for homework and projects, what it is, its class, units and time. */
export function EventRow({ e, className, unitNames, onOpen, showWhen }: {
  e: CalEvent;
  className?: string;
  unitNames?: string[];
  onOpen?: () => void;
  showWhen?: boolean;
}) {
  const toggle = useToggleDone();
  const done = !!e.done_at;
  const meta = kindMeta(e.kind);
  const sub = [className, unitNames?.length ? unitNames.join(", ") : null, showWhen ? whenText(e.due_on) : null, timeText(e.due_time)].filter(Boolean).join(" · ");
  return (
    <li className="flex items-center gap-3 py-2.5">
      {isTask(e.kind) ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={`${done ? "Mark not done" : "Mark done"}: ${e.title}`}
          onClick={() => toggle.mutate({ id: e.id, done: !done })}
          className={cn("grid size-11 flex-none place-items-center rounded-full border-2 [&_svg]:size-5", done ? "border-primary bg-primary text-[var(--on-fill)]" : "border-line-strong bg-card text-transparent")}
        >
          <Check />
        </button>
      ) : (
        <span className={cn("tile soft flex-none", e.kind === "test" && "!bg-primary !text-[var(--on-fill)]")} aria-hidden="true">{meta.icon}</span>
      )}
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className={cn("block truncate font-bold", done && "text-muted line-through")}>{e.title}</span>
        <span className="block truncate text-[0.875rem] text-muted"><span className="font-bold">{meta.label}</span>{sub && ` · ${sub}`}</span>
      </button>
    </li>
  );
}
