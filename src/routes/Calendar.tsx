import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { EventForm, kindMeta } from "@/components/EventForm";
import { EventRow } from "@/components/EventRow";
import { PageHeader } from "@/components/PageHeader";
import { ErrorState, PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { daysBetween, fromIso, monthGrid, shortDate, today, whenText } from "@/lib/calendar";
import { isExam, isTask, useDeleteEvent, useEvents, useSaveEvent, type CalEvent, type EventDraft, type EventKind } from "@/lib/queries/events";
import { useSubjects } from "@/lib/queries/profile";
import { useAllUnits } from "@/lib/queries/units";
import { PlanTaskRow } from "@/components/PlanTaskRow";
import { usePlan, useReadiness } from "@/lib/queries/plan";
import { ReadinessBadge } from "@/components/ReadinessBadge";
import { PLAN_MINUTES, usePlanMinutes } from "@/lib/preferences";
import { unitName } from "@/lib/units";

const KIND_VALUES: EventKind[] = ["test", "quiz", "homework", "project", "other"];
const monthName = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

/**
 * The calendar: tests, quizzes, homework, projects and anything else. Agenda (what's coming, and
 * homework still to do) or Month. `?add=1&subject=&kind=&date=` opens the form ready to fill.
 */
export default function Calendar() {
  const events = useEvents();
  const subjects = useSubjects();
  const units = useAllUnits();
  const save = useSaveEvent();
  const readinessOf = useReadiness();
  const del = useDeleteEvent();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<"agenda" | "month" | "plan">(() => (params.get("view") === "plan" ? "plan" : "agenda"));
  const now = today();
  const [month, setMonth] = useState(() => ({ y: fromIso(now).getFullYear(), m: fromIso(now).getMonth() }));
  const [picked, setPicked] = useState(now);

  // The form: a new item (from the button or a link) or one being changed.
  const editId = params.get("event");
  const adding = params.get("add") === "1";
  const kindParam = params.get("kind") as EventKind | null;
  const closeForm = () => setParams({}, { replace: true });
  const openNew = (date?: string) => setParams({ add: "1", ...(date ? { date } : {}) });

  if (events.isPending || subjects.isPending) return <PageSkeleton label="Opening your calendar." />;
  if (events.isError) return <ErrorState title="We could not open your calendar" onRetry={() => events.refetch()}>Check your connection, then try again.</ErrorState>;

  const all = events.data ?? [];
  const className = (id: string | null) => subjects.data?.find((s) => s.id === id)?.name;
  const unitNames = (e: CalEvent) => e.unit_ids.map((id) => units.data?.find((u) => u.id === id)).filter((u) => !!u).map((u) => unitName(u!));
  const editing = editId ? all.find((e) => e.id === editId) : undefined;
  const open = (e: CalEvent) => {
    setParams({ event: e.id });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const row = (e: CalEvent, showWhen = false) => (
    <EventRow key={e.id} e={e} className={className(e.subject_id)} unitNames={unitNames(e)} onOpen={() => open(e)} showWhen={showWhen} readiness={e.due_on >= now ? readinessOf(e)?.overall : null} />
  );

  const blank: EventDraft = {
    kind: kindParam && KIND_VALUES.includes(kindParam) ? kindParam : "test",
    title: "",
    subject_id: params.get("subject") && subjects.data?.some((s) => s.id === params.get("subject")) ? params.get("subject") : null,
    due_on: params.get("date") ?? now,
    due_time: null,
    notes: null,
    unit_ids: [],
  };
  const onSave = (draft: EventDraft) =>
    save.mutate(
      { id: editing?.id, draft },
      {
        onSuccess: () => {
          toast(editing ? "Saved." : "Added to your calendar.");
          closeForm();
          if (view === "month") setPicked(draft.due_on);
        },
        onError: () => toast("We could not save it. Check your connection, then try again."),
      },
    );

  const nextTest = all.find((e) => isExam(e.kind) && e.due_on >= now);
  const toDo = all.filter((e) => isTask(e.kind) && !e.done_at && e.due_on < now);
  const upcoming = all.filter((e) => e.due_on >= now);
  const past = all.filter((e) => e.due_on < now && !(isTask(e.kind) && !e.done_at)).reverse();
  const days = [...upcoming.reduce((m, e) => m.set(e.due_on, [...(m.get(e.due_on) ?? []), e]), new Map<string, CalEvent[]>())];

  return (
    <>
      <PageHeader title="Calendar" end={!adding && !editing && <Button onClick={() => openNew(view === "month" ? picked : undefined)}><Plus /> Add</Button>}>
        Tests, quizzes, homework and projects, all in one place.
      </PageHeader>

      {(adding || editing) && (
        <div className="mb-6">
          <EventForm
            key={editing?.id ?? "new"}
            initial={editing ? { kind: editing.kind, title: editing.title, subject_id: editing.subject_id, due_on: editing.due_on, due_time: editing.due_time, notes: editing.notes, unit_ids: editing.unit_ids } : blank}
            subjects={subjects.data ?? []}
            busy={save.isPending}
            onSave={onSave}
            onCancel={closeForm}
            onDelete={editing ? () => del.mutate(editing.id, { onSuccess: () => { toast("Deleted."); closeForm(); }, onError: () => toast("We could not delete it. Check your connection, then try again.") }) : undefined}
          />
        </div>
      )}

      {nextTest && (
        <section className="ink-panel burgundy mb-6 p-6" aria-labelledby="next-test">
          <span className="circle circle-big right-[-4rem] top-[-5rem] size-52" aria-hidden="true" />
          <p id="next-test" className="text-[0.9375rem] text-[#F7EAEC]">Next {kindMeta(nextTest.kind).label.toLowerCase()}</p>
          {daysBetween(now, nextTest.due_on) === 0 ? (
            <p className="big-num mt-1 text-[3.5rem]">Today</p>
          ) : (
            <p className="big-num mt-1 text-[4.5rem]">
              {daysBetween(now, nextTest.due_on)}
              <span className="ml-2 font-body text-[1.125rem] tracking-normal">{daysBetween(now, nextTest.due_on) === 1 ? "day to go" : "days to go"}</span>
            </p>
          )}
          <button type="button" onClick={() => open(nextTest)} className="mt-2 block text-left">
            <span className="block text-[1.25rem] font-bold">{nextTest.title}</span>
            <span className="block text-[0.9375rem] text-[#F7EAEC]">{[className(nextTest.subject_id), unitNames(nextTest).join(", "), shortDate(nextTest.due_on)].filter(Boolean).join(" · ")}</span>
          </button>
          {(() => {
            const r = readinessOf(nextTest);
            if (!r?.overall) return null;
            return (
              <div className="mt-4 flex flex-col gap-2">
                <ReadinessBadge r={r.overall} onDark />
                {r.units.length > 0 && (
                  <ul className="flex flex-col gap-1.5 border-t border-white/15 pt-3" aria-label="By unit">
                    {r.units.map((u) => (
                      <li key={u.id} className="flex flex-wrap items-center gap-2 text-[0.9375rem]"><b className="min-w-[5rem]">{u.name}</b>{u.r ? <ReadinessBadge r={u.r} onDark /> : <span className="text-[#F7EAEC]">Nothing to study yet</span>}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })()}
        </section>
      )}

      <div className="mb-4 flex gap-2" role="tablist" aria-label="View">
        {(["agenda", "month", "plan"] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} className="pill-option" onClick={() => setView(v)}>
            {v === "agenda" ? "Agenda" : v === "month" ? "Month" : "Study plan"}
          </button>
        ))}
      </div>

      {view === "plan" ? (
        <PlanView />
      ) : view === "agenda" ? (
        all.length === 0 ? (
          <section className="card card-dashed flex flex-col items-start gap-3 p-6">
            <span className="tile soft"><CalendarDays /></span>
            <p className="font-bold">Nothing on your calendar yet</p>
            <p className="text-muted">Add your next test, quiz or homework. Seeing what's coming makes it easier to plan around it.</p>
            <Button onClick={() => openNew()}><Plus /> Add your first one</Button>
          </section>
        ) : (
          <div className="flex flex-col gap-4">
            {toDo.length > 0 && (
              <section className="card p-5" aria-labelledby="todo">
                <h2 id="todo" className="text-[1.25rem]">Still to do</h2>
                <ul className="divide-y divide-line">{toDo.map((e) => row(e, true))}</ul>
              </section>
            )}
            {days.length === 0 && <p className="text-muted">Nothing coming up. Enjoy it, or add what's next.</p>}
            {days.map(([day, es]) => (
              <section key={day} className="card p-5" aria-labelledby={`d-${day}`}>
                <h2 id={`d-${day}`} className="text-[1.25rem]">
                  {whenText(day)}
                  {daysBetween(now, day) <= 13 && <span className="ml-2 font-body text-[0.9375rem] font-normal text-muted">{shortDate(day)}</span>}
                </h2>
                <ul className="divide-y divide-line">{es.map((e) => row(e))}</ul>
              </section>
            ))}
            {past.length > 0 && (
              <details className="mt-2">
                <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold text-ink-2">Earlier · {past.length}</summary>
                <ul className="card divide-y divide-line px-5 py-1">{past.map((e) => row(e, true))}</ul>
              </details>
            )}
          </div>
        )
      ) : (
        <MonthView
          month={month}
          setMonth={setMonth}
          events={all}
          picked={picked}
          setPicked={setPicked}
          now={now}
          dayList={(es) => (es.length ? <ul className="divide-y divide-line">{es.map((e) => row(e))}</ul> : <p className="py-2 text-muted">Nothing on this day.</p>)}
          onAdd={() => openNew(picked)}
        />
      )}
    </>
  );
}

function MonthView({ month, setMonth, events, picked, setPicked, now, dayList, onAdd }: {
  month: { y: number; m: number };
  setMonth: (m: { y: number; m: number }) => void;
  events: CalEvent[];
  picked: string;
  setPicked: (d: string) => void;
  now: string;
  dayList: (es: CalEvent[]) => ReactNode;
  onAdd: () => void;
}) {
  const weeks = monthGrid(month.y, month.m);
  const on = (d: string) => events.filter((e) => e.due_on === d);
  const step = (n: number) => {
    const d = new Date(month.y, month.m + n, 1);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
  };
  return (
    <>
      <section className="card p-4" aria-label={monthName.format(new Date(month.y, month.m, 1))}>
        <div className="mb-2 flex items-center justify-between">
          <Button variant="ghost" size="sm" aria-label="Previous month" onClick={() => step(-1)}><ChevronLeft /></Button>
          <h2 className="text-[1.25rem]">{monthName.format(new Date(month.y, month.m, 1))}</h2>
          <Button variant="ghost" size="sm" aria-label="Next month" onClick={() => step(1)}><ChevronRight /></Button>
        </div>
        <div className="grid grid-cols-7 text-center text-[0.8125rem] font-bold text-muted" aria-hidden="true">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i} className="py-1">{d}</span>)}
        </div>
        <div role="grid" className="grid gap-1">
          {weeks.map((w) => (
            <div key={w[0]} role="row" className="grid grid-cols-7 gap-1">
              {w.map((d) => {
                const es = on(d);
                const outside = fromIso(d).getMonth() !== month.m;
                return (
                  <button
                    key={d}
                    type="button"
                    role="gridcell"
                    aria-selected={d === picked}
                    aria-label={`${shortDate(d)}${es.length ? `, ${es.length} item${es.length > 1 ? "s" : ""}` : ""}`}
                    onClick={() => setPicked(d)}
                    className={cn(
                      "flex min-h-12 flex-col items-center justify-start gap-1 rounded-xl pt-1.5 text-[0.9375rem] tabular",
                      outside && "text-muted opacity-60",
                      d === now && "font-bold text-brand",
                      d === picked ? "bg-tint ring-2 ring-primary" : "hover:bg-soft",
                    )}
                  >
                    {fromIso(d).getDate()}
                    <span className="flex gap-0.5" aria-hidden="true">
                      {es.slice(0, 3).map((e) => (
                        <span key={e.id} className={cn("size-1.5 rounded-full", isExam(e.kind) ? "bg-hot" : e.done_at ? "bg-line-strong" : "bg-primary")} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>
      <section className="card mt-4 p-5" aria-labelledby="picked-day">
        <div className="flex items-center justify-between gap-3">
          <h2 id="picked-day" className="text-[1.25rem]">{whenText(picked)}{daysBetween(now, picked) <= 13 && daysBetween(now, picked) >= -6 && <span className="ml-2 font-body text-[0.9375rem] font-normal text-muted">{shortDate(picked)}</span>}</h2>
          <Button variant="secondary" size="sm" onClick={onAdd}><Plus /> Add</Button>
        </div>
        {dayList(on(picked))}
      </section>
    </>
  );
}

/** The week ahead: what to study each day for the tests coming up, within a daily time budget. */
function PlanView() {
  const plan = usePlan();
  const [minutes, setMinutes] = usePlanMinutes();
  if (!plan.ready) return <div className="skeleton h-48 rounded-[1.5rem]" />;
  const now = today();
  return (
    <div className="flex flex-col gap-4">
      <section className="card p-5" aria-labelledby="budget">
        <h2 id="budget" className="text-[1.25rem]">Time a day</h2>
        <p className="text-[0.9375rem] text-muted">The plan fits into this, with a bit more in the two days before a test.</p>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Minutes a day">
          {PLAN_MINUTES.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={minutes === m} className="pill-option" onClick={() => setMinutes(m)}>{m} min</button>
          ))}
        </div>
      </section>
      {plan.exams.length === 0 ? (
        <section className="card card-dashed p-6">
          <p className="font-bold">No tests or quizzes in the next two weeks</p>
          <p className="mt-1 text-muted">Add one with its class, and the units it covers if you know them. Your plan appears here and on Home.</p>
        </section>
      ) : (
        plan.days.filter((d) => d.tasks.length).map((d) => (
          <section key={d.day} className="card p-5" aria-labelledby={`p-${d.day}`}>
            <h2 id={`p-${d.day}`} className="text-[1.25rem]">
              {whenText(d.day)}
              <span className="ml-2 font-body text-[0.9375rem] font-normal text-muted">{daysBetween(now, d.day) <= 13 && shortDate(d.day)} · about {d.minutes} min</span>
            </h2>
            <ul className="divide-y divide-line">{d.tasks.map((t) => <PlanTaskRow key={t.key} t={t} today={d.day === now} />)}</ul>
          </section>
        ))
      )}
    </div>
  );
}
