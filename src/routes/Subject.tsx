import { ArrowLeft, ChevronRight, FileText, Upload } from "lucide-react";
import { Link, useParams } from "react-router";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { LEVEL_LABEL, type Level } from "@/lib/catalog";
import { useAllSubjects } from "@/lib/queries/profile";
import { pageWord, useSources } from "@/lib/queries/sources";

const fmt = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));

export default function Subject() {
  const { id } = useParams();
  const subjects = useAllSubjects();
  const sources = useSources();
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
