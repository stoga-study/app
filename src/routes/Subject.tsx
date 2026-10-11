import { ArrowLeft, ChevronRight, FileText, Layers, ListChecks, MessageCircle, Upload } from "lucide-react";
import { Link, useParams } from "react-router";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { LEVEL_LABEL, type Level } from "@/lib/catalog";
import { useAllSubjects } from "@/lib/queries/profile";
import { reviewMinutes, useDueCards } from "@/lib/queries/cards";
import { useQuizList } from "@/lib/queries/quiz";
import { pageWord, useSources } from "@/lib/queries/sources";

const fmt = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));

export default function Subject() {
  const { id } = useParams();
  const subjects = useAllSubjects();
  const sources = useSources();
  const due = useDueCards();
  const quizzes = useQuizList();
  if (subjects.isPending) return <PageSkeleton />;
  const subject = subjects.data?.find((s) => s.id === id);
  if (!subject) return <ErrorState title="We could not find that class">It may have been removed. <Link to="/subjects">See your subjects</Link>.</ErrorState>;
  const mine = (sources.data ?? []).filter((s) => s.subject_id === subject.id && s.status !== "uploaded");

  return (
    <>
      <Link to="/subjects" className="mb-4 inline-flex min-h-11 items-center gap-2 font-bold text-ink-2 no-underline">
        <ArrowLeft className="size-5" /> Subjects
      </Link>
      <PageHeader
        eyebrow={[subject.area, subject.level ? LEVEL_LABEL[subject.level as Level] : null, subject.archived ? "Archived" : null].filter(Boolean).join(" · ")}
        title={subject.name}
        end={<Button asChild><Link to={`/upload?subject=${subject.id}`}><Upload /> Add notes</Link></Button>}
      />
      {(() => {
        const n = due.data?.bySubject[subject.id] ?? 0;
        const mine = (quizzes.data ?? []).filter((q) => q.subject_id === subject.id);
        return (
          <div className="mb-8 grid gap-3 sm:grid-cols-3">
            <div className="card flex flex-col gap-2 p-5">
              <span className="flex items-center gap-2 font-bold"><Layers className="size-5 text-brand" /> Flashcards</span>
              <span className="text-muted">{n ? `${n} due, ${reviewMinutes(n).toLowerCase()}` : "Nothing due right now"}</span>
              {n > 0 && <Button asChild size="sm" className="mt-auto self-start"><Link to={`/review/session?subject=${subject.id}`}>Review</Link></Button>}
            </div>
            <div className="card flex flex-col gap-2 p-5">
              <span className="flex items-center gap-2 font-bold"><ListChecks className="size-5 text-brand" /> Practice quizzes</span>
              {mine.length ? mine.slice(0, 3).map((q) => (
                <Link key={q.id} to={`/quiz/${q.id}`} className="text-[0.9375rem] font-bold">{q.title}{q.last ? <span className="font-normal text-muted tabular">, last {q.last.correct}/{q.last.total}</span> : null}</Link>
              )) : <span className="text-muted">Each study set adds one.</span>}
            </div>
            <div className="card flex flex-col gap-2 p-5">
              <span className="flex items-center gap-2 font-bold"><MessageCircle className="size-5 text-brand" /> AI tutor</span>
              <span className="text-muted">Hints first, from your own notes.</span>
              <Button asChild size="sm" variant="secondary" className="mt-auto self-start"><Link to={`/tutor/${subject.id}`}>Ask a question</Link></Button>
            </div>
          </div>
        );
      })()}
      <h2 className="mb-3 text-[1.375rem]">Sources</h2>
      {sources.isPending ? (
        <div className="skeleton h-24 rounded-[1.5rem]" />
      ) : mine.length === 0 ? (
        <EmptyState icon={<Upload />} title={`${subject.name} has no material yet`} action={<Button asChild><Link to={`/upload?subject=${subject.id}`}>Add a PDF or notes</Link></Button>}>
          Add class notes, slides or a reading. Your study set is built from them.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {mine.map((s) => (
            <li key={s.id}>
              <Link to={`/sources/${s.id}`} className="card flex items-center gap-4 p-4 text-ink no-underline">
                <span className="tile soft"><FileText /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{s.filename}</span>
                  <span className="block text-[0.875rem] text-muted">{s.page_count} {pageWord(s.kind, s.page_count)} · added {fmt(s.created_at)}</span>
                </span>
                <ChevronRight className="size-5 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
