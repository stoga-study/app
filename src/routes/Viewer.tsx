import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ErrorState, PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { isPaged, pageWord, useSignedFileUrl, useSource, useSourcePages } from "@/lib/queries/sources";
import { highlightQuote } from "@/lib/viewerHighlight";

/** /sources/:id/view: the original file, in the app, jumped to a page and (when given) a cited passage. */
export default function Viewer() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const quote = params.get("quote");
  const source = useSource(id);
  const pages = useSourcePages(id);
  const url = useSignedFileUrl(source.data?.storage_path);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(true);
  const [renderError, setRenderError] = useState(false);
  const kind = source.data?.kind;

  useEffect(() => {
    if (!url.data || kind !== "pdf" || !canvasRef.current) return;
    let cancelled = false;
    setRendering(true);
    setRenderError(false);
    import("@/lib/extract/pdf")
      .then(({ renderPdfPageFromUrl }) => canvasRef.current && renderPdfPageFromUrl(url.data!, page, canvasRef.current, Math.min(900, window.innerWidth - 40)))
      .then(() => { if (!cancelled) setRendering(false); })
      .catch(() => { if (!cancelled) { setRendering(false); setRenderError(true); } });
    return () => { cancelled = true; };
  }, [url.data, page, kind]);

  useEffect(() => {
    if (quote) textRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [quote, page]);

  if (source.isPending) return <PageSkeleton />;
  if (!source.data) return <ErrorState title="We could not find that file"><Link to="/subjects">Go to your subjects</Link>.</ErrorState>;
  const s = source.data;
  if (!isPaged(s.kind) || !s.storage_path)
    return <ErrorState title="This file can't be shown here"><Link to={`/sources/${id}`}>Back to the file</Link>.</ErrorState>;

  const total = s.page_count || 1;
  const word = pageWord(s.kind, 1);
  const pageText = pages.data?.find((p) => p.page_no === page)?.text ?? "";
  const go = (n: number) => setParams((p) => { const next = new URLSearchParams(p); next.set("page", String(n)); next.delete("quote"); return next; }, { replace: true });

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4" aria-label={`${s.filename}, ${word} ${page}`}>
      <div className="flex items-center gap-3">
        <Link to={`/sources/${id}`} className="grid size-11 flex-none place-items-center rounded-full" aria-label="Back to file"><ArrowLeft className="size-5" /></Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{s.filename}</p>
          <p className="text-[0.875rem] text-muted tabular">{word.replace(/^./, (c) => c.toUpperCase())} {page} of {total}</p>
        </div>
      </div>

      <div className="card flex min-h-40 items-center justify-center overflow-hidden !shadow-none p-2">
        {s.kind === "image" ? (
          url.data ? <img src={url.data} alt={`${s.filename}, page ${page}`} className="max-h-[70vh] w-auto rounded-xl" /> : <div className="skeleton h-80 w-full rounded-xl" />
        ) : (
          <>
            {(rendering || !url.data) && !renderError && <div className="skeleton h-80 w-full rounded-xl" aria-label="Loading the page" />}
            {renderError && (
              <p className="callout">
                We could not show this page.{" "}
                {url.data && <a href={url.data} target="_blank" rel="noopener" className="font-bold">Open the original</a>} instead.
              </p>
            )}
            <canvas ref={canvasRef} className={rendering || renderError ? "hidden" : "max-w-full rounded-xl"} />
          </>
        )}
      </div>

      {total > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => go(page - 1)}><ChevronLeft /> Previous</Button>
          <span className="tabular text-[0.9375rem] text-muted">{page} / {total}</span>
          <Button variant="secondary" size="sm" disabled={page >= total} onClick={() => go(page + 1)}>Next <ChevronRight /></Button>
        </div>
      )}

      {pageText && (
        <div ref={textRef} className="card p-5">
          <p className="mb-2 text-[0.8125rem] font-bold text-muted">What we read from this {word}</p>
          <p className="whitespace-pre-line text-[0.9375rem] text-ink-2">
            {highlightQuote(pageText, quote).map((part, i) =>
              part.mark ? <mark key={i} className="rounded bg-tint px-0.5 text-ink">{part.text}</mark> : <span key={i}>{part.text}</span>,
            )}
          </p>
        </div>
      )}
    </section>
  );
}
