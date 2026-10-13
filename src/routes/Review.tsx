import { Flame, Layers, ListChecks, Play, RotateCcw } from "lucide-react";
import { Link } from "react-router";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { joinNames, reviewMinutes, useDueCards } from "@/lib/queries/cards";
import { useSubjects } from "@/lib/queries/profile";
import { useMistakes, useQuizList } from "@/lib/queries/quiz";
import { SESSION_LABEL, useSessionSize, type SessionSize } from "@/lib/preferences";
import { inScope, useDueQueue, useNextDue, useWeakCards } from "@/lib/queries/review";
import { useAllUnits } from "@/lib/queries/units";
import { unitName } from "@/lib/units";

export default function Review() {
  const due = useDueCards();
  const subjects = useSubjects();
  const quizzes = useQuizList();
  const mistakes = useMistakes();
  const nextDue = useNextDue();
  const queue = useDueQueue();
  const weak = useWeakCards();
  const units = useAllUnits();
  const [size, setSize] = useSessionSize();
  const sized = (base: string) => `${base}${base.includes("?") ? "&" : "?"}size=${size}`;
  if (due.isPending || subjects.isPending) return <PageSkeleton label="Getting your review ready." />;
  const name = (id: string) => subjects.data?.find((s) => s.id === id)?.name ?? "Class";
  const bySubject = Object.entries(due.data?.bySubject ?? {}).sort((a, b) => b[1] - a[1]);
  const count = due.data?.count ?? 0;
  const next = nextDue.data ? new Intl.DateTimeFormat("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" }).format(new Date(nextDue.data)) : null;
  const today = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(new Date());

  return (
    <>
      <PageHeader eyebrow={today} title="Review" />
      {count > 0 ? (
        <section className="ink-panel p-6" aria-labelledby="due-today">
          <span className="circle circle-big right-[-4rem] top-[-5rem] size-56" aria-hidden="true" />
          <span className="circle circle-hot right-8 top-8 size-9" aria-hidden="true" />
          <p id="due-today" className="ink-muted text-[0.8125rem] font-bold uppercase tracking-[0.06em]">Due today</p>
          <p className="big-num mt-1 text-[5.5rem]">{count}<span className="ml-2 font-body text-[1.25rem] tracking-normal">cards</span></p>
          <p className="ink-muted mt-1">{reviewMinutes(count)} across {joinNames(bySubject.map(([id]) => name(id)))}.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {bySubject.map(([id, n]) => <span key={id} className="chip chip-dark">{name(id)}, {n}</span>)}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button asChild variant="inverse"><Link to={sized("/review/session")}><Play /> {size === "all" || count <= Number(size) ? "Start" : `Start ${size} of ${count}`}</Link></Button>
            <SizePicker value={size} onChange={setSize} />
          </div>
        </section>
      ) : (
        <section className="card p-6">
          <span className="chip">Nothing overdue</span>
          <h2 className="mt-3 text-[1.75rem]">All caught up</h2>
          <p className="mt-1 text-muted">{(due.data?.total ?? 0) > 0 ? `You have finished everything due today.${next ? ` Next cards are due ${next}.` : ""}` : "Add notes to a class and your first flashcards will appear here."}</p>
        </section>
      )}

      {bySubject.length > 0 && (
        <section className="mt-6" aria-labelledby="by-subject">
          <h2 id="by-subject" className="mb-3 text-[1.375rem]">By class</h2>
          <ul className="card divide-y divide-line px-4">
            {bySubject.map(([id, n]) => {
              const subject = subjects.data?.find((x) => x.id === id);
              const unit = units.data?.find((u) => u.id === subject?.current_unit_id);
              const inUnit = unit && queue.data ? inScope(queue.data, { subjectId: id, unitId: unit.id }).length : 0;
              return (
                <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <Layers className="size-5 text-brand" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{name(id)}</span>
                    {unit && inUnit > 0 && <span className="block text-[0.875rem] text-muted">{inUnit} from {unitName(unit)}</span>}
                  </span>
                  <b className="tabular">{n}</b>
                  <span className="flex gap-2">
                    {unit && inUnit > 0 && inUnit < n && (
                      <Button asChild size="sm" variant="secondary"><Link to={sized(`/review/session?subject=${id}&unit=${unit.id}`)} aria-label={`Review ${unitName(unit)}`}>This unit</Link></Button>
                    )}
                    <Button asChild size="sm" variant="secondary"><Link to={sized(`/review/session?subject=${id}`)} aria-label={`Review all of ${name(id)}`}>{unit && inUnit > 0 && inUnit < n ? "Everything" : "Review"}</Link></Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(weak.data?.length ?? 0) > 0 && (
        <section className="mt-6" aria-labelledby="weak-title">
          <Link to={sized("/review/session?mode=weak")} className="card flex items-center gap-4 p-5 text-ink no-underline">
            <span className="tile t4"><Flame /></span>
            <span className="flex-1">
              <span id="weak-title" className="block font-display text-[1.25rem] font-bold">Weak cards</span>
              <span className="block text-muted">{weak.data!.length} {weak.data!.length === 1 ? "card" : "cards"} you have missed more than once or find hard. Practise them any time.</span>
            </span>
          </Link>
        </section>
      )}

      <section className="mt-6" aria-labelledby="mistakes-title">
        <Link to="/mistakes" className="card flex items-center gap-4 p-5 text-ink no-underline">
          <span className="tile t2"><RotateCcw /></span>
          <span className="flex-1">
            <span id="mistakes-title" className="block font-display text-[1.25rem] font-bold">Mistake review</span>
            <span className="block text-muted">{mistakes.data?.length ? `${mistakes.data.length} questions to revisit` : "Nothing to revisit right now"}</span>
          </span>
        </Link>
      </section>

      <section className="mt-6" aria-labelledby="quizzes-title">
        <h2 id="quizzes-title" className="mb-3 text-[1.375rem]">Practice quizzes</h2>
        {!quizzes.data?.length ? (
          <EmptyState icon={<ListChecks />} title="No quizzes yet">Each study set comes with a practice quiz.</EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {quizzes.data.map((q) => (
              <li key={q.id}>
                <Link to={`/quiz/${q.id}`} className="card flex h-full flex-col gap-1 p-5 text-ink no-underline">
                  <span className="text-[0.8125rem] font-bold uppercase tracking-[0.05em] text-brand">{name(q.subject_id)}, {q.count} questions</span>
                  <span className="font-display text-[1.125rem] font-bold">{q.title}</span>
                  <span className="text-[0.875rem] text-muted tabular">{q.last ? `Last: ${q.last.correct} of ${q.last.total}` : "Not taken yet"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function SizePicker({ value, onChange }: { value: SessionSize; onChange: (v: SessionSize) => void }) {
  return (
    <div className="inline-flex rounded-full bg-white/10 p-1" role="radiogroup" aria-label="Session size">
      {(["10", "20", "all"] as const).map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => onChange(o)}
          className={`min-h-9 rounded-full px-3 text-[0.875rem] font-bold ${value === o ? "bg-white text-[#2A0A10]" : "text-[#F7EAEC]"}`}
        >
          {SESSION_LABEL[o]}
        </button>
      ))}
    </div>
  );
}
