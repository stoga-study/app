import { Layers, ListChecks, Play, RotateCcw } from "lucide-react";
import { Link } from "react-router";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { joinNames, reviewMinutes, useDueCards } from "@/lib/queries/cards";
import { useSubjects } from "@/lib/queries/profile";
import { useMistakes, useQuizList } from "@/lib/queries/quiz";
import { useNextDue } from "@/lib/queries/review";

export default function Review() {
  const due = useDueCards();
  const subjects = useSubjects();
  const quizzes = useQuizList();
  const mistakes = useMistakes();
  const nextDue = useNextDue();
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
          <Button asChild variant="inverse" className="mt-5"><Link to="/review/session"><Play /> Start all</Link></Button>
        </section>
      ) : (
        <section className="card p-6">
          <span className="chip">Nothing overdue</span>
          <h2 className="mt-3 text-[1.75rem]">All caught up</h2>
          <p className="mt-1 text-muted">{(due.data?.total ?? 0) > 0 ? `You have finished everything due today.${next ? ` Next cards are due ${next}.` : ""}` : "Add notes to a class and your first flashcards will appear here."}</p>
        </section>
      )}

      {bySubject.length > 1 && (
        <section className="mt-6" aria-labelledby="by-subject">
          <h2 id="by-subject" className="mb-3 text-[1.375rem]">By class</h2>
          <ul className="card divide-y divide-line px-4">
            {bySubject.map(([id, n]) => (
              <li key={id} className="flex items-center gap-3 py-3">
                <Layers className="size-5 text-brand" aria-hidden="true" />
                <span className="flex-1 font-bold">{name(id)}</span>
                <b className="tabular">{n}</b>
                <Button asChild size="sm" variant="secondary"><Link to={`/review/session?subject=${id}`}>Review</Link></Button>
              </li>
            ))}
          </ul>
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
