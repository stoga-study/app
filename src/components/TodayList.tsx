import { Link, useNavigate } from "react-router";
import { addDays, today } from "@/lib/calendar";
import { isExam, isTask, useEvents } from "@/lib/queries/events";
import { usePlan } from "@/lib/queries/plan";
import { useSubjects } from "@/lib/queries/profile";
import { EventRow } from "./EventRow";
import { PlanTaskRow } from "./PlanTaskRow";

/** Home's "Today": the study plan's tasks, homework due soon, and any test today. */
export function TodayList() {
  const plan = usePlan();
  const events = useEvents();
  const subjects = useSubjects();
  const navigate = useNavigate();
  if (!plan.ready || !events.data) return null;
  const now = today();
  const name = (id: string | null) => subjects.data?.find((s) => s.id === id)?.name;
  const tasks = plan.days[0]?.tasks ?? [];
  const homework = events.data.filter((e) => isTask(e.kind) && !e.done_at && e.due_on <= addDays(now, 1));
  const testsToday = events.data.filter((e) => isExam(e.kind) && e.due_on === now);

  // Nothing today: the coach card below invites adding a test instead.
  if (!tasks.length && !homework.length && !testsToday.length) return null;

  const left = tasks.filter((t) => !t.done);
  const mins = left.reduce((n, t) => n + t.minutes, 0);
  return (
    <section className="card mb-4 p-5" aria-labelledby="today-plan">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 id="today-plan" className="flex-1 text-[1.375rem]">Today&apos;s plan</h2>
        <Link to="/calendar" className="text-[0.9375rem] font-bold">Calendar</Link>
      </div>
      {testsToday.map((e) => (
        <p key={e.id} className="callout mt-3"><span><b>{e.title}</b>{name(e.subject_id) ? ` in ${name(e.subject_id)}` : ""} is today. You&apos;ve got this.</span></p>
      ))}
      {tasks.length > 0 && (
        <p className="mt-1 text-[0.9375rem] text-muted">
          {left.length ? `About ${mins} minutes${plan.days[0].intense ? ", a bigger day before a test" : ""}.` : "All done for today. Nice work."}
        </p>
      )}
      <ul className="mt-1 divide-y divide-line">
        {tasks.map((t) => <PlanTaskRow key={t.key} t={t} today />)}
        {homework.map((e) => <EventRow key={e.id} e={e} className={name(e.subject_id)} showWhen onOpen={() => navigate(`/calendar?event=${e.id}`)} />)}
      </ul>
    </section>
  );
}
