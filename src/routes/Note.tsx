import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bold, CheckSquare, Cloud, CloudOff, FileText, Heading, List, Sigma, Trash2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Markdown } from "@/components/Markdown";
import { ErrorState, PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { insert, noteTitle, toggleCheck, toggleLines, wrap, type Edit } from "@/lib/noteEdit";
import { setRecent } from "@/lib/recent";
import { pushNote, saveDraft, useDeleteNote, useNote, type NoteDraft } from "@/lib/queries/notes";
import { useAllSubjects } from "@/lib/queries/profile";
import { pageWord, useSource, useSourcePages } from "@/lib/queries/sources";
import { useUnits } from "@/lib/queries/units";
import { unitName } from "@/lib/units";

const SYMBOLS = ["x̄", "p̂", "²", "³", "√", "π", "θ", "Δ", "μ", "σ", "Σ", "±", "≤", "≥", "≠", "≈", "→", "∞", "°", "½"];
type Status = "new" | "saving" | "saved" | "device";

/** /notes/:id: write your own notes. New notes come with ?subject= (and maybe &unit= and &source=). */
export default function NotePage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const note = useNote(id);
  // Wait for the newest copy (or for the check to fail offline) so the editor starts from it.
  if (note.isPending || (!note.isFetchedAfterMount && note.isFetching)) return <PageSkeleton label="Opening your note." />;
  if (!note.data && note.isError) return <ErrorState title="We could not open this note" onRetry={() => note.refetch()}>Check your connection, then try again.</ErrorState>;
  const subject = params.get("subject");
  const start: NoteDraft | null =
    note.data ?? (subject ? { id: id!, subject_id: subject, unit_id: params.get("unit"), source_id: params.get("source"), title: "", body: "", updated_at: new Date(0).toISOString() } : null);
  if (!start) return <ErrorState title="This note is not here anymore">It may have been deleted. <Link to="/subjects">Go to your subjects</Link>.</ErrorState>;
  return <Editor key={id} start={start} isNew={!note.data} />;
}

function Editor({ start, isNew }: { start: NoteDraft; isNew: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [note, setNote] = useState(start);
  const [status, setStatus] = useState<Status>(isNew ? "new" : "saved");
  const [view, setView] = useState<"write" | "preview" | "file">(isNew || !start.body ? "write" : "preview");
  const [symbols, setSymbols] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const selection = useRef<[number, number] | null>(null);
  const latest = useRef<NoteDraft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const subjects = useAllSubjects();
  const units = useUnits(note.subject_id);
  const source = useSource(note.source_id ?? undefined);
  const remove = useDeleteNote();
  const subject = subjects.data?.find((s) => s.id === note.subject_id);
  const back = note.source_id ? `/sources/${note.source_id}` : `/subjects/${note.subject_id}`;
  const label = noteTitle(note);

  // "Continue studying" on Home offers this note (once it has something in it).
  useEffect(() => {
    if (status !== "new") setRecent({ kind: "note", href: `/notes/${note.id}`, label, sub: subject ? `My notes · ${subject.name}` : "My notes" });
  }, [note.id, label, status, subject]);

  // Only reads refs and stable setters, so one copy serves the whole visit.
  const send = useCallback(async () => {
    const d = latest.current;
    if (!d) return;
    if (!navigator.onLine) return setStatus("device");
    try {
      await pushNote(d);
      if (latest.current === d) setStatus("saved");
      qc.setQueryData(["note", d.id], d);
      qc.invalidateQueries({ queryKey: ["notes"] });
    } catch {
      setStatus("device");
    }
  }, [qc]);

  function change(patch: Partial<NoteDraft>) {
    const d = { ...note, ...patch, updated_at: new Date().toISOString() };
    setNote(d);
    // A new note is only kept once something is in it.
    if (status === "new" && !d.title.trim() && !d.body.trim()) return;
    latest.current = d;
    void saveDraft(d);
    setStatus("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(send, 1200);
  }

  // Leaving the page sends what is waiting; offline, the device copy goes out later.
  useEffect(() => {
    const online = () => void send();
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("online", online);
      clearTimeout(timer.current);
      if (latest.current) void send();
    };
  }, [send]);

  function apply(fn: (e: Edit) => Edit) {
    const ta = area.current;
    if (!ta) return;
    const r = fn({ text: note.body, start: ta.selectionStart, end: ta.selectionEnd });
    // Put the cursor back as soon as React has written the new text (see the layout effect below).
    selection.current = [r.start, r.end];
    change({ body: r.text });
  }

  // Restoring it later (a frame afterwards) could move the cursor while the student is already typing.
  useLayoutEffect(() => {
    const ta = area.current, sel = selection.current;
    if (!ta || !sel) return;
    selection.current = null;
    ta.focus();
    ta.setSelectionRange(sel[0], sel[1]);
  });

  async function onDelete() {
    try {
      clearTimeout(timer.current);
      latest.current = null;
      await remove(note.id);
      toast("Note deleted.");
      navigate(back, { replace: true });
    } catch {
      toast("We could not delete it. Check your connection, then try again.");
    }
  }

  const tabs: [typeof view, string][] = [["write", "Write"], ["preview", "Preview"], ...(note.source_id ? [["file", "File"] as [typeof view, string]] : [])];

  return (
    <div className={note.source_id ? "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-6" : "mx-auto max-w-3xl"}>
      <div className="flex min-w-0 flex-col gap-3">
        <Link to={back} className="inline-flex min-h-11 items-center gap-2 self-start font-bold text-ink-2 no-underline">
          <ArrowLeft className="size-5" /> {note.source_id ? source.data?.filename ?? "Back to file" : subject?.name ?? "Back"}
        </Link>
        <label htmlFor="note-title" className="sr-only">Title</label>
        <input
          id="note-title"
          className="w-full bg-transparent font-display text-[1.75rem] font-bold leading-tight outline-none placeholder:text-muted"
          placeholder="Untitled note"
          maxLength={120}
          value={note.title}
          onChange={(e) => change({ title: e.target.value })}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.875rem] text-muted">
          {subject && <span className="font-bold">{subject.name}</span>}
          <label className="flex items-center gap-2">
            <span>Unit</span>
            <select className="input !min-h-9 !w-auto !py-1 text-[0.875rem]" value={note.unit_id ?? ""} onChange={(e) => change({ unit_id: e.target.value || null })}>
              <option value="">No unit</option>
              {units.data?.map((u) => <option key={u.id} value={u.id}>{unitName(u)}</option>)}
            </select>
          </label>
          <SaveStatus status={status} />
        </div>

        <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-1 bg-bg px-1 py-2">
          <div className="flex gap-1" role="tablist" aria-label="View">
            {tabs.map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`pill-option !min-h-9 !px-3 ${k === "file" ? "lg:hidden" : ""}`}>{label}</button>
            ))}
          </div>
          {view === "write" && (
            <div className="ml-auto flex gap-1" role="toolbar" aria-label="Formatting">
              <Tool label="Heading" onClick={() => apply((e) => toggleLines(e, "## "))}><Heading /></Tool>
              <Tool label="Bold" onClick={() => apply((e) => wrap(e))}><Bold /></Tool>
              <Tool label="Bulleted list" onClick={() => apply((e) => toggleLines(e, "- "))}><List /></Tool>
              <Tool label="Checklist" onClick={() => apply((e) => toggleLines(e, "- [ ] "))}><CheckSquare /></Tool>
              <Tool label="Math symbols" pressed={symbols} onClick={() => setSymbols((v) => !v)}><Sigma /></Tool>
            </div>
          )}
          {view === "write" && symbols && (
            <div className="flex w-full flex-wrap gap-1 pt-1" aria-label="Math symbols">
              {SYMBOLS.map((s) => (
                <button key={s} type="button" className="grid size-9 place-items-center rounded-lg border border-line bg-card font-bold" aria-label={`Insert ${s}`} onClick={() => apply((e) => insert(e, s))}>{s}</button>
              ))}
            </div>
          )}
        </div>

        {view === "write" && (
          <>
            <label htmlFor="note-body" className="sr-only">Notes</label>
            <textarea
              id="note-body"
              ref={area}
              autoFocus={isNew}
              className="input min-h-[55vh] w-full resize-y leading-relaxed [field-sizing:content]"
              placeholder={"Start writing. Try:\n## A heading\n- a bullet\n- [ ] something to do"}
              value={note.body}
              onChange={(e) => change({ body: e.target.value })}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
                  e.preventDefault();
                  apply((x) => wrap(x));
                }
              }}
            />
          </>
        )}
        {view === "preview" && (
          <div className="card min-h-[40vh] p-5">
            {note.body.trim() ? (
              <Markdown text={note.body} className="text-ink-2" onCheck={(n) => change({ body: toggleCheck(note.body, n) })} />
            ) : (
              <p className="text-muted">Nothing here yet. Tap Write to start.</p>
            )}
          </div>
        )}
        {view === "file" && note.source_id && <FilePanel sourceId={note.source_id} />}

        <div className="mt-4">
          {!confirming ? (
            status !== "new" && <Button variant="ghost" onClick={() => setConfirming(true)}><Trash2 /> Delete note</Button>
          ) : (
            <div role="alert" className="card flex flex-wrap items-center gap-3 p-4">
              <p className="flex-1">Delete this note? This cannot be undone.</p>
              <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>Keep it</Button>
              <Button size="sm" onClick={onDelete}>Delete</Button>
            </div>
          )}
        </div>
      </div>
      {note.source_id && (
        <aside className="hidden lg:block" aria-label="The file">
          <div className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <FilePanel sourceId={note.source_id} />
          </div>
        </aside>
      )}
    </div>
  );
}

function Tool({ label, onClick, pressed, children }: { label: string; onClick: () => void; pressed?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      // Keep the textarea's selection: a mouse-down on the button would otherwise move focus first.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-soft [&_svg]:size-[1.125rem] ${pressed ? "bg-soft text-brand" : ""}`}
    >
      {children}
    </button>
  );
}

function SaveStatus({ status }: { status: Status }) {
  if (status === "new") return null;
  return (
    <span className="ml-auto flex items-center gap-1.5" role="status" aria-live="polite">
      {status === "device" ? <CloudOff className="size-4" /> : <Cloud className="size-4" />}
      {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Saved on this device. It syncs when you are back online."}
    </span>
  );
}

/** The file beside your notes: its pages, to read while you write. */
function FilePanel({ sourceId }: { sourceId: string }) {
  const source = useSource(sourceId);
  const pages = useSourcePages(sourceId);
  if (pages.isPending) return <div className="skeleton h-64 rounded-[1.5rem]" />;
  if (!pages.data?.length) return <p className="callout neutral">The file&apos;s pages are not available{navigator.onLine ? "" : " offline"}.</p>;
  return (
    <section className="flex flex-col gap-3" aria-label={source.data?.filename ?? "File"}>
      <p className="flex items-center gap-2 font-bold"><FileText className="size-5 text-brand" /> <span className="truncate">{source.data?.filename}</span></p>
      {pages.data.map((p) => (
        <div key={p.page_no} className="card !shadow-none p-4">
          <p className="mb-1 text-[0.8125rem] font-bold capitalize text-muted">{pageWord(source.data?.kind ?? "pdf", 1)} {p.page_no}</p>
          <p className="whitespace-pre-line text-[0.9375rem] text-ink-2">{p.text}</p>
        </div>
      ))}
    </section>
  );
}
