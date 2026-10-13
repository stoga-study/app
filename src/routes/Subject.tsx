import { ArrowLeft, Check, ChevronRight, FileText, Layers, ListChecks, MessageCircle, Pencil, Pin, PinOff, Upload } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { LEVEL_LABEL, type Level } from "@/lib/catalog";
import { useAllSubjects } from "@/lib/queries/profile";
import { reviewMinutes, useDueCards } from "@/lib/queries/cards";
import { useQuizList } from "@/lib/queries/quiz";
import { pageWord, useSources, type Source } from "@/lib/queries/sources";
import { useCurrentUnit, useRenameUnit, useUnits, type Unit } from "@/lib/queries/units";
import { unitName } from "@/lib/units";
import { toast } from "sonner";

const fmt = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));

export default function Subject() {
  const { id } = useParams();
  const subjects = useAllSubjects();
  const sources = useSources();
  const due = useDueCards();
  const quizzes = useQuizList();
  const units = useUnits(id);
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
      {!!units.data?.length && <NowStudying subjectId={subject.id} units={units.data} currentId={subject.current_unit_id} pinned={subject.current_unit_pinned} />}
      <h2 className="mb-3 text-[1.375rem]">Sources</h2>
      {sources.isPending ? (
        <div className="skeleton h-24 rounded-[1.5rem]" />
      ) : mine.length === 0 ? (
        <EmptyState icon={<Upload />} title={`${subject.name} has no material yet`} action={<Button asChild><Link to={`/upload?subject=${subject.id}`}>Add a PDF or notes</Link></Button>}>
          Add class notes, slides or a reading. Your study set is built from them.
        </EmptyState>
      ) : (
        <ByUnit files={mine} units={units.data ?? []} currentId={subject.current_unit_id} />
      )}
    </>
  );
}

/** "Now: Unit 11 · …": follows the newest upload, unless the student pins one. */
function NowStudying({ subjectId, units, currentId, pinned }: { subjectId: string; units: Unit[]; currentId: string | null; pinned: boolean }) {
  const set = useCurrentUnit();
  const [changing, setChanging] = useState(false);
  const current = units.find((u) => u.id === currentId);
  const save = (unitId: string | null, pin: boolean) =>
    set.mutate({ subjectId, unitId, pinned: pin }, { onSuccess: () => setChanging(false), onError: () => toast("We could not save that. Check your connection, then try again.") });
  return (
    <section className="card mb-8 flex flex-col gap-3 p-5" aria-labelledby="now-title">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-full min-w-0 sm:w-auto sm:flex-1">
          <span id="now-title" className="block text-[0.8125rem] font-bold text-muted">Now studying</span>
          <span className="block font-display text-[1.25rem] font-bold">{current ? unitName(current) : "No unit yet"}</span>
          <span className="block text-[0.875rem] text-muted">{pinned ? "Pinned by you." : "Follows your newest upload."}</span>
        </span>
        {current && (
          <Button variant="secondary" size="sm" disabled={set.isPending} onClick={() => save(current.id, !pinned)}>
            {pinned ? <><PinOff /> Unpin</> : <><Pin /> Pin</>}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => setChanging((c) => !c)}>Change</Button>
      </div>
      {changing && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Unit you are on">
          {units.map((u) => (
            <button key={u.id} type="button" role="radio" aria-checked={u.id === currentId} className="pill-option" disabled={set.isPending} onClick={() => save(u.id, true)}>
              {u.id === currentId && <Check />}{unitName(u)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Lesson order inside a unit (11.2 before 11.10); files without a lesson keep newest first, after them. */
const lessonNo = (l: string | null) => (l ? Number(l.split(".")[1]) : Infinity);
const byLesson = (a: Source, b: Source) => lessonNo(a.lesson) - lessonNo(b.lesson) || b.created_at.localeCompare(a.created_at);

/** Files grouped by unit: the current unit first, then in teaching order, then files with no unit. */
function ByUnit({ files, units, currentId }: { files: Source[]; units: Unit[]; currentId: string | null }) {
  if (!units.length) return <FileList files={files} />;
  const groups = [...units].sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId))
    .map((u) => ({ unit: u as Unit | null, files: files.filter((f) => f.unit_id === u.id).sort(byLesson) }))
    .filter((g) => g.files.length);
  const unfiled = files.filter((f) => !f.unit_id || !units.some((u) => u.id === f.unit_id));
  if (unfiled.length) groups.push({ unit: null, files: unfiled });
  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.unit?.id ?? "none"} aria-label={g.unit ? unitName(g.unit) : "No unit"}>
          {g.unit ? <UnitHeading unit={g.unit} current={g.unit.id === currentId} count={g.files.length} /> : <h3 className="mb-2 text-[1.0625rem] text-muted">No unit · {g.files.length}</h3>}
          <FileList files={g.files} />
        </section>
      ))}
    </div>
  );
}

function UnitHeading({ unit, current, count }: { unit: Unit; current: boolean; count: number }) {
  const rename = useRenameUnit();
  const [editing, setEditing] = useState<string | null>(null);
  if (editing !== null)
    return (
      <form
        className="mb-2 flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          // A unit without a number needs a name.
          if (!unit.number && !editing.trim()) return;
          rename.mutate({ id: unit.id, title: editing }, { onSuccess: () => setEditing(null), onError: () => toast("We could not rename it. Check your connection, then try again.") });
        }}
      >
        <label htmlFor={`unit-${unit.id}`} className="sr-only">Name for {unitName({ ...unit, title: null })}</label>
        <input id={`unit-${unit.id}`} autoFocus className="input !min-h-10 flex-1" placeholder="e.g. The French Revolution" maxLength={80} value={editing} onChange={(e) => setEditing(e.target.value)} />
        <Button type="submit" size="sm" aria-label="Save name" disabled={rename.isPending}><Check /></Button>
      </form>
    );
  return (
    <div className="mb-2 flex items-center gap-1">
      <h3 className="text-[1.0625rem]">
        {unitName(unit)} <span className="font-normal text-muted">· {count}</span>
        {current && <span className="ml-2 rounded-full bg-tint px-2 py-0.5 align-middle text-[0.75rem] font-bold text-brand">Now</span>}
      </h3>
      <button type="button" aria-label={`Rename ${unitName(unit)}`} onClick={() => setEditing(unit.title ?? "")} className="grid size-9 place-items-center rounded-full text-muted hover:bg-soft">
        <Pencil className="size-4" />
      </button>
    </div>
  );
}

function FileList({ files }: { files: Source[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {files.map((s) => (
        <li key={s.id}>
          <Link to={`/sources/${s.id}`} className="card flex items-center gap-4 p-4 text-ink no-underline">
            <span className="tile soft"><FileText /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{s.filename}</span>
              <span className="block text-[0.875rem] text-muted">
                {s.lesson && <span className="mr-1.5 rounded-full bg-soft px-2 py-0.5 font-bold text-ink-2">Lesson {s.lesson}</span>}
                {s.page_count} {pageWord(s.kind, s.page_count)} · added {fmt(s.created_at)}
              </span>
            </span>
            <ChevronRight className="size-5 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
