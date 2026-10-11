import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Camera, Check, ClipboardPaste, FileText, Upload as UploadIcon } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/session";
import { ExtractError, extractFile, extractPasted, MAX_BYTES, type ExtractErrorCode, type Extracted } from "@/lib/extract";
import { useSubjects } from "@/lib/queries/profile";
import { prettyFilename } from "@/lib/extract/filename";
import { pageWord, saveUpload, suggestTitle, UploadLimitError, useAllowance } from "@/lib/queries/sources";
import { startGeneration } from "@/lib/queries/studyset";

type Phase =
  | { step: "choose" }
  | { step: "reading"; name: string; size?: number; done: number; total: number }
  | { step: "saving"; name: string; size?: number; extracted: Extracted; done: number; total: number }
  | { step: "error"; name: string; code: ExtractErrorCode | "limit" | "save" };

const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fmtDate = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(new Date(iso));

// What happened, what usually works, and that nothing was lost (Brand Guidelines p. 14).
type ErrorCode = Extract<Phase, { step: "error" }>["code"];

function errorCopy(code: ErrorCode, name: string, resetsAt?: string, limit?: number | null) {
  const tips = {
    pdf: "Export a fresh PDF from the original (File, then Download or Save as PDF)",
    paste: "Or copy the text and paste it instead",
  };
  switch (code) {
    case "password":
      return { title: `We could not open ${name}`, body: "It is password protected, so we cannot read it.", tips: ["Open it and save a copy without a password", "Print it to PDF, then upload the new file", tips.paste] };
    case "scanned":
      return { title: `${name} is pages of images`, body: "It looks scanned, so there is no text in it we can read yet. Reading photos of pages is coming later.", tips: [tips.pdf, tips.paste] };
    case "empty":
      return { title: `${name} has no text in it`, body: "We did not find anything to read.", tips: ["Check it is the right file", tips.paste] };
    case "too_large":
      return { title: `${name} is over 25 MB`, body: "That is more than one upload can hold.", tips: ["Split it into chapters or units", "Export it again with smaller images"] };
    case "too_many_pages":
      return { title: `${name} is over 400 pages`, body: "That is more than one upload can hold.", tips: ["Split it into chapters or units, and upload the ones you are studying"] };
    case "legacy_doc":
      return { title: "This is an older Word file (.doc)", body: "We can read .docx files and PDFs.", tips: ["Open it in Word or Google Docs and save it as .docx or PDF", tips.paste] };
    case "unsupported":
      return { title: "We cannot read this kind of file yet", body: "Use a PDF, a Word file (.docx) or a text file. Photos of notes are coming later.", tips: [tips.paste] };
    case "damaged":
      return { title: `${name} looks damaged`, body: "We could not open it.", tips: ["Download or export it again, then upload the new copy", tips.paste] };
    case "limit":
      return {
        title: `That was this month's ${limit ?? 10} uploads`,
        body: `More arrive on ${resetsAt ? fmtDate(resetsAt) : "the 1st"}. Your notes, cards and quizzes still work.`,
        tips: ["Review what you already have", "Use your own key on the Independent plan for more"],
        noRefundLine: true,
      };
    case "save":
      return { title: `We could not save ${name}`, body: "The connection dropped while saving.", tips: ["Check your connection, then try again"] };
  }
}

export default function Upload() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { session } = useAuth();
  const [params] = useSearchParams();
  const subjects = useSubjects();
  const allowance = useAllowance();
  const [subjectId, setSubjectId] = useState<string | null>(params.get("subject"));
  const [phase, setPhase] = useState<Phase>({ step: "choose" });
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const list = subjects.data ?? [];
  const subject = list.find((s) => s.id === subjectId) ?? list[0];
  const uploads = allowance.data?.upload;
  const atLimit = uploads?.limit != null && uploads.used >= uploads.limit;

  if (subjects.isPending) return <div className="skeleton h-64 rounded-[1.5rem]" />;
  if (list.length === 0)
    return (
      <>
        <PageHeader title="Add notes" />
        <EmptyState icon={<UploadIcon />} title="Add a class first" action={<Button asChild><Link to="/classes">Choose your classes</Link></Button>}>
          Notes live inside a class, so pick your classes and then add notes to one.
        </EmptyState>
      </>
    );

  async function save(name: string, extracted: Extracted, file?: File, size?: number) {
    const title = file ? prettyFilename(file.name) : name;
    setPhase({ step: "saving", name: title, size, extracted, done: 0, total: extracted.pages.length });
    try {
      const id = await saveUpload({
        userId: session!.user.id,
        subjectId: subject!.id,
        filename: title,
        originalName: name,
        extracted,
        file,
        onSaving: (done, total) => setPhase({ step: "saving", name: title, size, extracted, done, total }),
      });
      qc.invalidateQueries({ queryKey: ["sources"] });
      qc.invalidateQueries({ queryKey: ["allowance"] });
      // Start the study set straight away; the source page shows its progress.
      await startGeneration(id).catch(() => undefined);
      // A smarter title arrives a moment later for files; pasted notes keep the title the student typed.
      if (file)
        suggestTitle(id).then((better) => {
          if (!better) return;
          qc.invalidateQueries({ queryKey: ["source", id] });
          qc.invalidateQueries({ queryKey: ["sources"] });
        });
      navigate(`/sources/${id}`, { replace: true, state: { justUploaded: true } });
    } catch (e) {
      qc.invalidateQueries({ queryKey: ["allowance"] });
      setPhase({ step: "error", name, code: e instanceof UploadLimitError ? "limit" : "save" });
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const title = prettyFilename(file.name);
    setPhase({ step: "reading", name: title, size: file.size, done: 0, total: 0 });
    try {
      const extracted = await extractFile(file, (done, total) => setPhase({ step: "reading", name: title, size: file.size, done, total }));
      await save(file.name, extracted, file, file.size);
    } catch (e) {
      setPhase({ step: "error", name: file.name, code: e instanceof ExtractError ? e.code : "damaged" });
    }
  }

  async function onPaste() {
    const name = pasteTitle.trim() || `Pasted notes, ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date())}`;
    try {
      await save(name, extractPasted(pasted));
    } catch (e) {
      setPhase({ step: "error", name, code: e instanceof ExtractError ? e.code : "save" });
    }
  }

  if (phase.step === "reading" || phase.step === "saving") {
    const reading = phase.step === "reading";
    const pct = reading ? (phase.total ? (phase.done / phase.total) * 60 : 8) : 60 + (phase.total ? (phase.done / phase.total) * 40 : 0);
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-5" aria-busy="true">
        <h1 className="text-[1.75rem]">Adding to {subject!.name}</h1>
        <div className="card flex items-center gap-4 p-4">
          <span className="tile soft"><FileText /></span>
          <div className="min-w-0">
            <p className="truncate font-bold">{phase.name}</p>
            {phase.size != null && <p className="text-[0.875rem] text-muted">{fmtSize(phase.size)}</p>}
          </div>
        </div>
        <div className="bar !h-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Upload progress">
          <span style={{ width: `${pct}%` }} />
        </div>
        <ul className="card divide-y divide-line px-4">
          <Step state={reading ? "working" : "done"} label="Reading pages" end={reading ? (phase.total ? `${phase.done} of ${phase.total}` : "Opening") : `${phase.extracted.pages.length} ${pageWord(phase.extracted.kind, phase.extracted.pages.length)}`} />
          <Step state={reading ? "waiting" : "working"} label="Saving to your account" end={reading ? "Waiting" : "Working"} />
        </ul>
        <p className="text-center text-[0.875rem] text-muted">Your file is private to you. Reading happens on this device.</p>
      </div>
    );
  }

  if (phase.step === "error") {
    const c = errorCopy(phase.code, phase.name, uploads?.resetsAt, uploads?.limit);
    return (
      <section role="alert" className="mx-auto flex max-w-xl flex-col gap-4">
        <span className="tile t4"><AlertCircle /></span>
        <h1 className="break-words text-[1.75rem]">{c.title}</h1>
        <p className="text-ink-2">
          {c.body} {"noRefundLine" in c ? "" : `Nothing was counted against your ${uploads?.limit ?? 10} uploads.`}
        </p>
        <div className="card p-4">
          <p className="font-bold">What usually works</p>
          <ul className="mt-1 list-disc pl-5 text-[0.9375rem] text-muted">{c.tips.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
        <Button block onClick={() => setPhase({ step: "choose" })}>{phase.code === "limit" ? "Back" : "Try another file"}</Button>
        {phase.code !== "limit" && (
          <Button variant="secondary" block onClick={() => { setPasting(true); setPhase({ step: "choose" }); }}>
            <ClipboardPaste /> Paste text instead
          </Button>
        )}
      </section>
    );
  }

  return (
    <>
      <PageHeader title={`Add to ${subject!.name}`}>
        {uploads?.limit != null ? (
          <span className="tabular">{uploads.used} of {uploads.limit} uploads used this month. Reviewing never counts.</span>
        ) : (
          "Add notes, slides or a reading."
        )}
      </PageHeader>

      {list.length > 1 && (
        <div className="mb-5 flex flex-col gap-2">
          <span className="field-label">Class</span>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 md:flex-wrap" role="radiogroup" aria-label="Class">
            {list.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={s.id === subject!.id} aria-pressed={s.id === subject!.id} className="pill-option flex-none" onClick={() => setSubjectId(s.id)}>
                {s.id === subject!.id && <Check />}
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {atLimit ? (
        <div className="callout"><span><b>That was this month&apos;s {uploads!.limit} uploads.</b> More arrive on {fmtDate(uploads!.resetsAt)}. Your notes, cards and quizzes still work.</span></div>
      ) : pasting ? (
        <section className="card flex flex-col gap-4 p-5" aria-labelledby="paste-title">
          <h2 id="paste-title" className="text-[1.25rem]">Paste your notes</h2>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="paste-name" className="field-label">Title (optional)</label>
            <input id="paste-name" className="input" placeholder="e.g. Chapter 7 notes" maxLength={120} value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="paste-text" className="field-label">Notes</label>
            <textarea id="paste-text" className="input !min-h-56" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste class notes, a reading or a study sheet" />
            <p className="field-hint tabular">{pasted.trim().length.toLocaleString()} characters</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={pasted.trim().length < 40} onClick={onPaste}>Add these notes</Button>
            <Button variant="secondary" onClick={() => setPasting(false)}>Upload a file instead</Button>
          </div>
          {pasted.trim().length > 0 && pasted.trim().length < 40 && <p className="field-hint">Add a little more text so there is something to study.</p>}
        </section>
      ) : (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files?.[0]); }}
            className={`flex w-full flex-col items-center gap-2 rounded-[1.5rem] border-2 border-dashed px-5 py-12 text-center ${over ? "border-hot bg-tint" : "border-tint-line bg-tint"}`}
          >
            <UploadIcon className="size-8 text-brand" />
            <span className="font-display text-[1.375rem] font-bold">Choose or drop a file</span>
            <span className="text-[0.9375rem] text-muted">PDF, Word (.docx) or text. Up to {MAX_BYTES / 1024 / 1024} MB.</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            tabIndex={-1}
            accept=".pdf,.docx,.doc,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; onFile(f); }}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setPasting(true)}><ClipboardPaste /> Paste text</Button>
            <span className="chip chip-neutral !min-h-11 px-4"><Camera /> Photos of notes: coming later</span>
          </div>
          <p className="mt-6 text-[0.875rem] text-muted">Your files are private to you. Text is read on this device; the original is stored so you can reopen it.</p>
        </>
      )}
    </>
  );
}

function Step({ state, label, end }: { state: "done" | "working" | "waiting"; label: string; end: ReactNode }) {
  return (
    <li className={`flex items-center gap-3 py-3 ${state === "waiting" ? "text-muted" : ""} ${state === "working" ? "font-bold" : ""}`}>
      <span
        className={`grid size-6 flex-none place-items-center rounded-full border-2 ${state === "done" ? "border-primary bg-primary text-white" : state === "working" ? "animate-[spin_800ms_linear_infinite] border-tint-line border-t-hot" : "border-line-strong"}`}
        aria-hidden="true"
      >
        {state === "done" && <Check className="size-3.5" />}
      </span>
      {label}
      <span className="ml-auto text-[0.875rem] font-normal text-muted tabular">{end}</span>
    </li>
  );
}
