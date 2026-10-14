import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ExternalLink, FileText, MessageCircle, NotebookPen, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ErrorState, PageSkeleton } from "@/components/States";
import { Failed, Processing, SetView } from "@/components/StudySet";
import { StudySetChooser } from "@/components/StudySetChooser";
import { Button } from "@/components/ui/button";
import { NoteList } from "@/components/NoteList";
import { UnitPicker } from "@/components/UnitPicker";
import { useSubjects } from "@/lib/queries/profile";
import { isPaged, openOriginal, pageWord, useDeleteSource, useRenameSource, useSource, useSourcePages } from "@/lib/queries/sources";
import { startErrorText, startGeneration, useCaps, useLiveSource, useStudySet } from "@/lib/queries/studyset";
import { newNoteUrl, useNotes } from "@/lib/queries/notes";
import { useFileUnder, useUnits } from "@/lib/queries/units";
import { findUnit } from "@/lib/units";
import { setRecent } from "@/lib/recent";
import { NONE, type GenOptions } from "../../supabase/functions/_lib/options";

/** The biggest thing a study set has, for the header: cards first, then questions, notes or guide. */
function headline(d: { cards: unknown[]; questions: unknown[]; notes: unknown[]; guide: unknown[] }): [number, string] | null {
  if (d.cards.length) return [d.cards.length, "flashcards"];
  if (d.questions.length) return [d.questions.length, "quiz questions"];
  if (d.notes.length) return [d.notes.length, "note sections"];
  if (d.guide.length) return [d.guide.length, "guide sections"];
  return null;
}

export default function SourcePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const justUploaded = (useLocation().state as { justUploaded?: boolean } | null)?.justUploaded;
  const source = useSource(id);
  const pages = useSourcePages(id);
  const subjects = useSubjects();
  const del = useDeleteSource();
  const [confirming, setConfirming] = useState(false);
  const rename = useRenameSource();
  const [editing, setEditing] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const qc = useQueryClient();
  useLiveSource(id, source.data?.status);
  const ready = source.data?.status === "ready";
  const set = useStudySet(id, ready);
  const caps = useCaps();
  const [more, setMore] = useState(false);
  const units = useUnits(source.data?.subject_id);
  const fileUnder = useFileUnder();
  const notes = useNotes(source.data?.subject_id);
  const fileName = source.data?.filename;
  const className = subjects.data?.find((x) => x.id === source.data?.subject_id)?.name;
  useEffect(() => {
    if (id && fileName) setRecent({ kind: "file", href: `/sources/${id}`, label: fileName, sub: className });
  }, [id, fileName, className]);

  /** Make a study set (or more of one) with these choices, or resume a failed one (no choices). */
  async function start(options?: GenOptions) {
    setStarting(true);
    try {
      await startGeneration(id!, options);
      setMore(false);
      await qc.invalidateQueries({ queryKey: ["source", id] });
      qc.invalidateQueries({ queryKey: ["studyset", id] });
      qc.invalidateQueries({ queryKey: ["allowance"] });
      qc.invalidateQueries({ queryKey: ["subjects"] });
    } catch (e) {
      toast(startErrorText(e));
    } finally {
      setStarting(false);
    }
  }

  if (source.isPending) return <PageSkeleton label="Opening your file." />;
  if (source.isError) return <ErrorState title="We could not open this file" onRetry={() => source.refetch()}>Check your connection, then try again.</ErrorState>;
  if (!source.data)
    return <ErrorState title="This file is not here anymore">It may have been deleted. <Link to="/subjects">Go to your subjects</Link>.</ErrorState>;

  const s = source.data;
  const pagesList = (
    <>
        {pages.isPending ? (
        <div className="skeleton h-40 rounded-[1.5rem]" />
      ) : (
        <ul className="flex flex-col gap-2">
          {pages.data?.map((p) => (
            <li key={p.page_no}>
              <details className="card group !shadow-none">
                <summary className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
                  <FileText className="mt-0.5 size-5 text-brand" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold capitalize">{pageWord(s.kind, 1)} {p.page_no}</span>
                    <span className="block truncate text-[0.9375rem] text-muted group-open:hidden">{p.text.slice(0, 160)}</span>
                  </span>
                </summary>
                <p className="whitespace-pre-line px-4 pb-4 text-[0.9375rem] text-ink-2">{p.text}</p>
                {isPaged(s.kind) && s.storage_path && (
                  <Link to={`/sources/${s.id}/view?page=${p.page_no}`} className="mb-4 ml-4 inline-block text-[0.875rem] font-bold text-brand">View original →</Link>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
  const subject = subjects.data?.find((x) => x.id === s.subject_id);
  const read = pages.data?.length ?? 0;
  // Amounts in the chooser are suggested from how much text the file has.
  const chars = pages.data ? pages.data.reduce((n, p) => n + p.text.length, 0) : null;
  const word = pageWord(s.kind, s.page_count);

  return (
    <>
      <Link to={subject ? `/subjects/${subject.id}` : "/subjects"} className="mb-4 inline-flex min-h-11 items-center gap-2 font-bold text-ink-2 no-underline">
        <ArrowLeft className="size-5" /> {subject?.name ?? "Subjects"}
      </Link>

      <section className={`ink-panel p-6 ${justUploaded ? "pop" : ""}`} aria-labelledby="source-title">
        <span className="circle circle-big right-[-5rem] top-[-6rem] size-60" aria-hidden="true" />
        <span className="circle circle-hot right-8 top-8 size-9" aria-hidden="true" />
        <p className="ink-muted text-[0.9375rem]">{ready ? "Study set ready" : s.status === "ready_text" ? "Saved" : justUploaded ? "Added and read." : "Source"}</p>
        {editing === null ? (
          <div className="mt-1 flex items-start gap-2">
            <h1 id="source-title" className="max-w-[30rem] break-words text-[1.75rem]">{s.filename}</h1>
            <button type="button" onClick={() => setEditing(s.filename)} aria-label="Rename" className="mt-1 grid size-10 flex-none place-items-center rounded-full text-[#F7EAEC] hover:bg-white/10">
              <Pencil className="size-5" />
            </button>
          </div>
        ) : (
          <form
            className="mt-2 flex max-w-[30rem] gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const t = editing.replace(/\s+/g, " ").trim().slice(0, 120);
              if (!t) return;
              rename.mutate({ id: s.id, title: t }, { onSuccess: () => setEditing(null), onError: () => toast("We could not rename it. Check your connection, then try again.") });
            }}
          >
            <label htmlFor="rename" className="sr-only">Title</label>
            <input id="rename" autoFocus className="input !min-h-11 flex-1 !bg-white/10 !text-white" value={editing} maxLength={120} onChange={(e) => setEditing(e.target.value)} />
            <Button type="submit" variant="inverse" size="sm" aria-label="Save title" disabled={rename.isPending}><Check /></Button>
          </form>
        )}
        {s.original_filename && s.original_filename !== s.filename && (
          <p className="ink-muted mt-1 max-w-[30rem] truncate text-[0.8125rem]" title={s.original_filename}>Original file: {s.original_filename}</p>
        )}
        {ready && set.data && headline(set.data) ? (
          <p className="big-num pop mt-4 text-[4.5rem]">
            {headline(set.data)![0]}
            <span className="ml-2 font-body text-[1.125rem] tracking-normal">{headline(set.data)![1]}</span>
          </p>
        ) : (
          <p className="big-num mt-4 text-[4.5rem]">
            {s.page_count}
            <span className="ml-2 font-body text-[1.125rem] tracking-normal">{word} read</span>
          </p>
        )}
        {read > 0 && read < s.page_count && (
          <p className="ink-muted mt-2 text-[0.9375rem]">{s.page_count - read} blank {pageWord(s.kind, s.page_count - read)} skipped.</p>
        )}
      </section>

      {units.data && (
        <div className="mt-4">
          <UnitPicker
            units={units.data}
            value={s.unit_id ? { kind: "existing", id: s.unit_id, lesson: s.lesson } : { kind: "none" }}
            lesson={s.lesson ?? findUnit(s.original_filename ?? s.filename)?.lesson}
            onChange={(choice) =>
              fileUnder.mutate({ sourceId: s.id, subjectId: s.subject_id, choice }, { onError: () => toast("We could not change the unit. Check your connection, then try again.") })
            }
          />
        </div>
      )}
      {s.status === "generating" && <Processing source={s} />}
      {s.status === "failed" && <Failed source={s} onRetry={() => start()} retrying={starting} />}
      {s.status === "ready_text" && caps.data && (
        <div className="card mt-4 p-5">
          <StudySetChooser
            mode="upload"
            chars={chars}
            caps={caps.data}
            initial={(subjects.data?.find((x) => x.id === s.subject_id)?.study_defaults as { parts?: Record<string, boolean> } | null)?.parts}
            busy={starting}
            onMake={(o) => start(o)}
          />
        </div>
      )}
      {ready && more && caps.data && set.data && (
        <div className="card mt-4 p-5">
          <StudySetChooser
            mode="more"
            chars={chars}
            caps={caps.data}
            existing={{ notes: set.data.notes.length > 0, cards: set.data.cards.length > 0, quiz: set.data.quizzes.length > 0, guide: set.data.guide.length > 0 }}
            busy={starting}
            onMake={(o) => start(o)}
            onCancel={() => setMore(false)}
          />
        </div>
      )}
      {ready && !more && (
        <Button variant="secondary" className="mt-4" onClick={() => setMore(true)}><Plus /> Make more from this file</Button>
      )}
      {ready && (
        <SetView
          source={s}
          pagesSlot={pagesList}
          regenerating={starting}
          onRegenerateGuide={(focus) => {
            const count = Math.min(caps.data?.guide ?? 12, set.data?.guide.length || 6);
            void start({ parts: { ...NONE, guide: true }, amounts: { cards: 0, quiz: 0, terms: 0, guide: count }, focus });
          }}
        />
      )}

      <section className="mt-8" aria-labelledby="my-notes">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 id="my-notes" className="flex-1 text-[1.375rem]">My notes</h2>
          <Button variant="secondary" size="sm" onClick={() => navigate(newNoteUrl({ subjectId: s.subject_id, unitId: s.unit_id, sourceId: s.id }))}>
            <NotebookPen /> Write notes
          </Button>
        </div>
        {(() => {
          const mine = (notes.data ?? []).filter((n) => n.source_id === s.id);
          return mine.length ? <NoteList notes={mine} /> : <p className="text-muted">Write your own notes with this file open beside them.</p>;
        })()}
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        {(s.status === "ready_text" || ready) && (
          <Button variant="secondary" asChild><Link to={`/tutor/${s.subject_id}?source=${s.id}`}><MessageCircle /> Ask the tutor about this file</Link></Button>
        )}
        {s.storage_path && (
          <Button variant="secondary" onClick={() => openOriginal(s).catch(() => toast("We could not open the original. Check your connection, then try again."))}>
            <ExternalLink /> Open original
          </Button>
        )}
        {!confirming ? (
          <Button variant="ghost" onClick={() => setConfirming(true)}><Trash2 /> Delete</Button>
        ) : (
          <div role="alert" className="card flex w-full flex-wrap items-center gap-3 p-4">
            <p className="flex-1">Delete {s.filename} and its text? This cannot be undone.</p>
            <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>Keep it</Button>
            <Button
              size="sm"
              disabled={del.isPending}
              onClick={() =>
                del.mutate(s, {
                  onSuccess: () => { toast(`${s.filename} was deleted.`); navigate(subject ? `/subjects/${subject.id}` : "/subjects", { replace: true }); },
                  onError: () => toast("We could not delete it. Check your connection, then try again."),
                })
              }
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      {!ready && (
        <section className="mt-8" aria-labelledby="pages-title">
          <h2 id="pages-title" className="mb-3 text-[1.375rem]">What we read</h2>
          {pagesList}
        </section>
      )}
    </>
  );
}
