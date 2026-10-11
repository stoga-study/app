import { ArrowLeft, ExternalLink, FileText, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ErrorState, PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { useSubjects } from "@/lib/queries/profile";
import { openOriginal, pageWord, useDeleteSource, useSource, useSourcePages } from "@/lib/queries/sources";

export default function SourcePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const justUploaded = (useLocation().state as { justUploaded?: boolean } | null)?.justUploaded;
  const source = useSource(id);
  const pages = useSourcePages(id);
  const subjects = useSubjects();
  const del = useDeleteSource();
  const [confirming, setConfirming] = useState(false);

  if (source.isPending) return <PageSkeleton label="Opening your file." />;
  if (source.isError) return <ErrorState title="We could not open this file" onRetry={() => source.refetch()}>Check your connection, then try again.</ErrorState>;
  if (!source.data)
    return <ErrorState title="This file is not here anymore">It may have been deleted. <Link to="/subjects">Go to your subjects</Link>.</ErrorState>;

  const s = source.data;
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
        <p className="ink-muted text-[0.9375rem]">{justUploaded ? "Added and read." : "Source"}</p>
        <h1 id="source-title" className="mt-1 max-w-[30rem] break-words text-[1.75rem]">{s.filename}</h1>
        <p className="big-num mt-4 text-[4.5rem]">
          {s.page_count}
          <span className="ml-2 font-body text-[1.125rem] tracking-normal">{word} read</span>
        </p>
        {read > 0 && read < s.page_count && (
          <p className="ink-muted mt-2 text-[0.9375rem]">{s.page_count - read} blank {pageWord(s.kind, s.page_count - read)} skipped.</p>
        )}
      </section>

      <div className="card card-dashed mt-4 flex items-start gap-4 p-5">
        <span className="tile soft"><Sparkles /></span>
        <div>
          <p className="font-bold">Study set: coming in the next update</p>
          <p className="text-[0.9375rem] text-muted">
            Notes, flashcards, a practice quiz and a study guide from this file, each linked to its {s.kind === "pdf" ? "pages" : "parts"}. Your file is saved and ready for it.
          </p>
        </div>
      </div>

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

      <section className="mt-8" aria-labelledby="pages-title">
        <h2 id="pages-title" className="mb-3 text-[1.375rem]">What we read</h2>
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
      </section>
    </>
  );
}
