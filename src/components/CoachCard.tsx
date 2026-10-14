import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { daysBetween, today } from "@/lib/calendar";
import { coachNudge } from "@/lib/nudge";
import { isExam, isTask, useEvents } from "@/lib/queries/events";
import { useReadiness } from "@/lib/queries/plan";
import { useFaces, useSubjects } from "@/lib/queries/profile";
import { Face } from "./Face";

/** Home's coach card: one line written by rules from the calendar and readiness, and a way in. */
export function CoachCard() {
  const events = useEvents();
  const subjects = useSubjects();
  const readinessOf = useReadiness();
  const { coach } = useFaces();
  if (!events.data || !subjects.data) return null;
  const now = today();
  const name = (id: string | null) => subjects.data?.find((s) => s.id === id)?.name ?? null;
  const exams = events.data
    .filter((e) => isExam(e.kind) && e.due_on >= now)
    .map((e) => {
      const r = readinessOf(e);
      return { title: e.title, className: name(e.subject_id), daysLeft: daysBetween(now, e.due_on), fresh: r?.fresh ?? 0, cards: r?.cards ?? 0, readiness: r?.overall ?? null };
    });
  const overdue = events.data.filter((e) => isTask(e.kind) && !e.done_at && e.due_on < now).length;
  const n = coachNudge({ hasClasses: subjects.data.length > 0, exams, overdue });
  if (!n) return null;
  return (
    <section className="card mb-4 flex flex-wrap items-center gap-4 p-5" aria-label="Coach">
      <Face face={coach.face} size={52} mood="idle" title={coach.name} />
      <p className="min-w-[12rem] flex-1"><b className="mb-0.5 block text-[0.875rem] text-brand">{coach.name}</b>{n.text}</p>
      <Button asChild variant="secondary" size="sm">
        <Link to={n.say ? `/coach?say=${encodeURIComponent(n.say)}` : "/coach"}>{n.cta}</Link>
      </Button>
    </section>
  );
}
