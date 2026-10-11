import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ExternalLink, FileText, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ErrorState, PageSkeleton } from "@/components/States";
import { Failed, NotStarted, Processing, SetView } from "@/components/StudySet";
import { Button } from "@/components/ui/button";
import { useSubjects } from "@/lib/queries/profile";
import { openOriginal, pageWord, useDeleteSource, useRenameSource, useSource, useSourcePages } from "@/lib/queries/sources";
import { startGeneration, useLiveSource, useStudySet } from "@/lib/queries/studyset";

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

  async function start() {
    setStarting(true);
    try {
      await startGeneration(id!);
      await qc.invalidateQueries({ queryKey: ["source", id] });
    } catch {
      toast("We could not start your study set. Check your connection, then try again.");
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
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
  const subject = subjects.data?.find((x) => x.id === s.subject_id);
  const read = pages.data?.length ?? 0;
  const word = pageWord(s.kind, s.page_count);

  return (
    <>
      <Link to={subject ? `/subjects/${subject.id}` : "/subjects"} className="mb-4 inline-flex min-h-11 items-center gap-2 font-bold text-ink-2 no-underline">
        <ArrowLeft className="size-5" /> {subject?.name ?? "Subjects"}
      </Link>

      <section className={`ink-panel p-6 ${justUploaded ? "pop" : ""}`} aria-labelledby="source-title">
        <span className="circle circle-big right-[-5rem] top-[-6rem] size-60" aria-hidden="true" />
        <span className="circle circle-hot bottom-6 right-8 size-9" aria-hidden="true" />
        <p className="ink-muted text-[0.9375rem]">{ready ? "Study set ready. We made" : justUploaded ? "Added and read." : "Source"}</p>
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
        {ready && set.data ? (
          <p className="big-num pop mt-4 text-[4.5rem]">
            {set.data.cards.length}
            <span className="ml-2 font-body text-[1.125rem] tracking-normal">flashcards</span>
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

      {s.status === "generating" && <Processing source={s} />}
      {s.status === "failed" && <Failed source={s} onRetry={start} retrying={starting} />}
      {s.status === "ready_text" && <NotStarted onStart={start} starting={starting} />}
      {ready && <SetView source={s} pagesSlot={pagesList} />}

      <div className="mt-4 flex flex-wrap gap-2">
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
