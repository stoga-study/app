import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Camera, Check, ClipboardPaste, FileText, Images, RotateCw, Trash2, Upload as UploadIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { StudySetChooser } from "@/components/StudySetChooser";
import { UnitPicker } from "@/components/UnitPicker";
import type { GenOptions } from "../../supabase/functions/_lib/options";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/session";
import { ExtractError, extractFile, extractPasted, MAX_BYTES, MAX_PAGE_CHARS, MAX_SCAN_PAGES, readPhotos, tidy, type ExtractErrorCode, type Extracted, type ExtractStage } from "@/lib/extract";
import { readPageImage } from "@/lib/readPage";
import { useSubjects } from "@/lib/queries/profile";
import { prettyFilename } from "@/lib/extract/filename";
import { pageWord, saveUpload, suggestTitle, UploadLimitError, useAllowance } from "@/lib/queries/sources";
import { startErrorText, startGeneration, useCaps } from "@/lib/queries/studyset";
import { choiceFor, fileUnder, useUnits, type UnitChoice } from "@/lib/queries/units";
import { findUnit } from "@/lib/units";
import { useOnline } from "@/lib/useOnline";

type Progress = { done: number; total: number; stage: ExtractStage };
type PhotoItem = { file: File; url: string; jpeg: Blob | null; text: string; status: "reading" | "ready" | "error" };
type Phase =
  | { step: "choose" }
  /** Several photos (or a pasted screenshot), read and shown for a check before they become one file. */
  | { step: "photos"; items: PhotoItem[] }
  /** The file is being read while the student picks what to make. */
  | { step: "options"; name: string; title: string; size?: number; file?: File; photo?: boolean; progress: Progress; extracted?: Extracted; waiting?: boolean }
  | { step: "reading"; name: string; size?: number; done: number; total: number; stage: ExtractStage; photo?: boolean }
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
      return { title: `${name} is pages of images`, body: "It looks scanned, and we could not read it.", tips: [tips.pdf, tips.paste] };
    case "too_many_scanned":
      return { title: `${name} has over ${MAX_SCAN_PAGES} scanned pages`, body: "Scanned pages are read one by one, so one upload can hold up to " + MAX_SCAN_PAGES + ".", tips: ["Split it into chapters or units, and upload the ones you are studying", tips.pdf] };
    case "scan_limit":
      return { title: "That is a lot of scanned pages for one day", body: "Reading scans and photos has a daily limit. More are available tomorrow.", tips: ["Upload text-based PDFs or Word files, which have no limit like this", tips.paste] };
    case "scan_failed":
      return { title: `We could not read ${name}`, body: "Reading the scanned pages did not work this time.", tips: ["Check your connection, then try again in a minute", tips.paste] };
    case "photo_unreadable":
      return { title: `We could not open ${name}`, body: "This photo format did not open on this device.", tips: ["Take the photo again, or share it as a JPG or PNG", tips.paste] };
    case "empty":
      return { title: `${name} has no text in it`, body: "We did not find anything to read.", tips: ["Check it is the right file", tips.paste] };
    case "too_large":
      return { title: `${name} is over 25 MB`, body: "That is more than one upload can hold.", tips: ["Split it into chapters or units", "Export it again with smaller images"] };
    case "too_many_pages":
      return { title: `${name} is over 400 pages`, body: "That is more than one upload can hold.", tips: ["Split it into chapters or units, and upload the ones you are studying"] };
    case "legacy_doc":
      return { title: "This is an older Word file (.doc)", body: "We can read .docx files and PDFs.", tips: ["Open it in Word or Google Docs and save it as .docx or PDF", tips.paste] };
    case "unsupported":
      return { title: "We cannot read this kind of file yet", body: "Use a PDF, a Word file (.docx), a text file or a photo (JPG, PNG or HEIC).", tips: [tips.paste] };
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
  const caps = useCaps();
  // A choice made before the file finished reading; carried out once it has.
  const queued = useRef<{ make: GenOptions | null; unit: UnitChoice } | null>(null);
  // The unit the student picked; until then, the one found in the file (if any).
  const [unitPick, setUnitPick] = useState<UnitChoice | null>(null);
  // Which file the screen is about, so a file the student moved on from is ignored.
  const current = useRef(0);
  const queuedChoice = () => queued.current;
  const cameraRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);
  const online = useOnline();

  const list = subjects.data ?? [];
  const subject = list.find((s) => s.id === subjectId) ?? list[0];
  const uploads = allowance.data?.upload;
  const atLimit = uploads?.limit != null && uploads.used >= uploads.limit;
  const units = useUnits(subject?.id);

  // A pasted screenshot goes straight into the same "check the reading" flow as several photos.
  useEffect(() => {
    if (phase.step !== "choose" || pasting) return;
    function onWindowPaste(e: ClipboardEvent) {
      const files = [...(e.clipboardData?.items ?? [])]
        .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
        .map((it) => it.getAsFile())
        .filter((f): f is File => !!f);
      if (files.length) {
        e.preventDefault();
        void onPhotos(files);
      }
    }
    window.addEventListener("paste", onWindowPaste);
    return () => window.removeEventListener("paste", onWindowPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.step, pasting]);

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

  async function save(name: string, extracted: Extracted, make: GenOptions | null, unit: UnitChoice, file?: File, size?: number) {
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
      // File it under its unit; the class's current unit follows unless pinned. A miss here never loses the file.
      await fileUnder(id, subject!.id, unit, true).catch(() => toast("Saved, but we could not file it under a unit. You can pick one on the file's page."));
      qc.invalidateQueries({ queryKey: ["units"] });
      qc.invalidateQueries({ queryKey: ["sources"] });
      qc.invalidateQueries({ queryKey: ["allowance"] });
      // Make what the student chose; the file page shows the progress. Just saving makes nothing.
      if (make) await startGeneration(id, make).catch((e) => toast(startErrorText(e)));
      // The class now remembers this choice, and may be on a new unit. Waited for, so the cache saved on the
      // device has it before we move on.
      await qc.invalidateQueries({ queryKey: ["subjects"] });
      qc.invalidateQueries({ queryKey: ["allowance"] });
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
    const run = ++current.current;
    queued.current = null;
    setUnitPick(null);
    const title = prettyFilename(file.name);
    const photo = /^image\//.test(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
    setPhase({ step: "options", name: file.name, title, size: file.size, file, photo, progress: { done: 0, total: 0, stage: photo ? "scan" : "text" } });
    try {
      const extracted = await extractFile(
        file,
        (done, total, stage) => { if (current.current === run) setPhase((p) => (p.step === "options" ? { ...p, progress: { done, total, stage } } : p)); },
        readPageImage,
      );
      if (current.current !== run) return;
      setPhase((p) => (p.step === "options" ? { ...p, extracted } : p));
      // TypeScript cannot see that a tap may have queued a choice while we awaited, so read it through a function.
      const choice = queuedChoice();
      if (choice) await save(file.name, extracted, choice.make, choice.unit, file, file.size);
    } catch (e) {
      if (current.current === run) setPhase({ step: "error", name: file.name, code: e instanceof ExtractError ? e.code : "damaged" });
    }
  }

  /** Several photos (or a pasted screenshot): read each (up to 3 at once), then show them for a check. */
  async function onPhotos(files: File[]) {
    if (!files.length) return;
    // "Add more photos" keeps the ones already being checked; anything else starts fresh.
    const keep = phase.step === "photos" ? phase.items : [];
    const run = phase.step === "photos" ? current.current : ++current.current;
    const fresh: PhotoItem[] = files.map((file) => ({ file, url: URL.createObjectURL(file), jpeg: null, text: "", status: "reading" }));
    setPhase({ step: "photos", items: [...keep, ...fresh] });
    await readPhotos(files, readPageImage, (index, result) => {
      if (current.current !== run) return;
      const url = fresh[index].url;
      setPhase((p) => {
        if (p.step !== "photos") return p;
        // Matched by url, since removing a photo meanwhile shifts the positions.
        return {
          ...p,
          items: p.items.map((it) => (it.url !== url ? it : "error" in result ? { ...it, status: "error" } : { ...it, jpeg: result.jpeg, text: result.text, status: "ready" })),
        };
      });
    });
  }

  const photosInput = (
    <input
      ref={photosRef}
      type="file"
      multiple
      aria-label="Add several photos"
      className="sr-only"
      tabIndex={-1}
      accept="image/*"
      onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; void onPhotos(fs); }}
    />
  );

  /** Photos are keyed by their preview url: positions shift when one is removed mid-read. */
  function setPhotoItem(url: string, patch: Partial<PhotoItem>) {
    setPhase((p) => (p.step === "photos" ? { ...p, items: p.items.map((it) => (it.url === url ? { ...it, ...patch } : it)) } : p));
  }

  async function rereadPhoto(url: string, jpeg: Blob) {
    setPhotoItem(url, { status: "reading" });
    try {
      const { blobToDataUrl } = await import("@/lib/extract/image");
      const text = tidy(await readPageImage(await blobToDataUrl(jpeg))).slice(0, MAX_PAGE_CHARS);
      setPhotoItem(url, { text, status: "ready" });
    } catch {
      setPhotoItem(url, { status: "error" });
    }
  }

  async function rotatePhoto(item: PhotoItem) {
    if (!item.jpeg) return;
    const { rotateJpeg } = await import("@/lib/extract/image");
    const rotated = await rotateJpeg(item.jpeg, 90);
    const url = URL.createObjectURL(rotated);
    setPhotoItem(item.url, { jpeg: rotated, url, status: "reading" });
    URL.revokeObjectURL(item.url);
    await rereadPhoto(url, rotated);
  }

  function removePhoto(item: PhotoItem) {
    URL.revokeObjectURL(item.url);
    setPhase((p) => (p.step === "photos" ? { ...p, items: p.items.filter((it) => it.url !== item.url) } : p));
  }

  /** Combine the checked photos into one PDF (one page each) and hand off to the usual choices step. */
  async function finishPhotos(items: PhotoItem[]) {
    const ready = items.filter((it): it is PhotoItem & { jpeg: Blob } => it.status === "ready" && !!it.jpeg);
    if (!ready.length) return;
    current.current++;
    queued.current = null;
    setUnitPick(null);
    const title = `Photos, ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date())}`;
    setPhase({ step: "options", name: title, title, photo: true, progress: { done: ready.length, total: ready.length, stage: "scan" } });
    try {
      const { photosToPdf } = await import("@/lib/extract/combine");
      const pdfBlob = await photosToPdf(ready.map((r) => r.jpeg));
      const pdfFile = new File([pdfBlob], `${title}.pdf`, { type: "application/pdf" });
      const extracted: Extracted = {
        kind: "pdf", pages: ready.map((r, i) => ({ page: i + 1, text: r.text })), totalPages: ready.length, skippedPages: 0, scannedPages: ready.length,
      };
      setPhase((p) => (p.step === "options" ? { ...p, extracted, file: pdfFile, size: pdfFile.size } : p));
      const choice = queuedChoice();
      if (choice) await save(title, extracted, choice.make, choice.unit, pdfFile, pdfFile.size);
    } catch {
      setPhase({ step: "error", name: title, code: "damaged" });
    } finally {
      items.forEach((it) => URL.revokeObjectURL(it.url));
    }
  }

  /** "Make it" (with choices) or "Just save it" (null). Waits for the file if it is still being read. */
  function decide(make: GenOptions | null, unit: UnitChoice | null) {
    if (phase.step !== "options" || !unit) return;
    if (phase.extracted) void save(phase.name, phase.extracted, make, unit, phase.file, phase.size);
    else {
      queued.current = { make, unit };
      setPhase({ ...phase, waiting: true });
    }
  }

  function onPaste() {
    const name = pasteTitle.trim() || `Pasted notes, ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date())}`;
    try {
      const extracted = extractPasted(pasted);
      current.current++;
      queued.current = null;
      setUnitPick(null);
      setPhase({ step: "options", name, title: name, progress: { done: 1, total: 1, stage: "text" }, extracted });
    } catch (e) {
      setPhase({ step: "error", name, code: e instanceof ExtractError ? e.code : "save" });
    }
  }

  if (phase.step === "photos") {
    const { items } = phase;
    const allReady = items.length > 0 && items.every((it) => it.status === "ready");
    const anyBusy = items.some((it) => it.status === "reading");
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <h1 className="text-[1.75rem]">Check the reading</h1>
        <p className="text-muted">Make sure each photo was read right. Rotate a sideways one, or read it again.</p>
        {items.length === 0 ? (
          <p className="callout neutral">Every photo was removed. Add more, or cancel.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((it, i) => (
              <li key={it.url} className="card flex gap-3 p-4">
                <img src={it.url} alt={`Photo ${i + 1}`} className="h-24 w-24 flex-none rounded-lg border border-line object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="text-[0.8125rem] font-bold text-muted">Photo {i + 1}</p>
                  {it.status === "reading" ? (
                    <p className="text-muted" aria-live="polite">Reading…</p>
                  ) : it.status === "error" ? (
                    <p className="text-brand">We could not read this one.</p>
                  ) : (
                    <p className="line-clamp-3 text-[0.9375rem] text-ink-2">{it.text || "No text found."}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" disabled={it.status === "reading" || !it.jpeg} onClick={() => rotatePhoto(it)}><RotateCw /> Rotate</Button>
                    {it.jpeg && <Button size="sm" variant="ghost" disabled={it.status === "reading"} onClick={() => rereadPhoto(it.url, it.jpeg!)}>Read again</Button>}
                    <Button size="sm" variant="ghost" onClick={() => removePhoto(it)}><Trash2 /> Remove</Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!allReady || anyBusy} onClick={() => finishPhotos(items)}>Looks good, continue</Button>
          <Button variant="secondary" onClick={() => photosRef.current?.click()}><Images /> Add more photos</Button>
          {photosInput}
          <Button
            variant="ghost"
            onClick={() => { items.forEach((it) => URL.revokeObjectURL(it.url)); current.current++; setPhase({ step: "choose" }); }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (phase.step === "options") {
    const { progress, extracted } = phase;
    // Look in the name first, then the first page once it is read ("Ask every time" when neither says).
    // The raw name, since the tidy title turns "U2L6" into "Lesson 6".
    const found = findUnit(phase.name, extracted?.pages[0]?.text ?? "");
    const unit = unitPick ?? choiceFor(found, units.data ?? []);
    const chars = extracted ? extracted.pages.reduce((n, pg) => n + pg.text.length, 0) : null;
    const status = extracted
      ? `${extracted.scannedPages === extracted.pages.length ? "Read scanned" : "Read"} ${extracted.pages.length} ${pageWord(extracted.kind, extracted.pages.length)}${
          extracted.scannedPages && extracted.scannedPages < extracted.pages.length ? ` (${extracted.scannedPages} from scans)` : ""
        }`
      : phase.photo ? "Reading your photo…"
        : progress.stage === "scan" ? `Reading scanned pages${progress.total ? `, ${progress.done} of ${progress.total}` : "…"}`
          : progress.total ? `Reading pages, ${progress.done} of ${progress.total}` : "Opening…";
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <h1 className="text-[1.75rem]">Adding to {subject!.name}</h1>
        <div className="card flex items-center gap-4 p-4">
          <span className="tile soft"><FileText /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{phase.title}</p>
            <p className="text-[0.875rem] text-muted" aria-live="polite">
              {phase.size != null && `${fmtSize(phase.size)} · `}{status}{extracted && <Check className="ml-1 inline size-4 text-brand" aria-hidden="true" />}
            </p>
          </div>
        </div>
        {(units.data || units.isError) && (
          <UnitPicker
            key={phase.name}
            units={units.data ?? []}
            value={unit}
            onChange={setUnitPick}
            lesson={found?.lesson}
            word={found?.word}
            why={extracted ? "We could not tell from the file. Pick one so it is easy to find later." : "Pick one so it is easy to find later."}
          />
        )}
        <StudySetChooser
          key={phase.name}
          mode="upload"
          chars={chars}
          caps={caps.data ?? { cards: 60, quiz: 25, guide: 12, terms: 20 }}
          initial={(subject!.study_defaults as { parts?: Record<string, boolean> } | null)?.parts}
          busy={phase.waiting}
          reading={phase.waiting && !extracted ? "We'll start as soon as the file is read." : null}
          blocked={atLimit ? `That was this month's ${uploads!.limit} study sets. You can still save files and write your own notes. More on ${fmtDate(uploads!.resetsAt)}.` : null}
          needs={unit ? null : "Choose a unit above first (or No unit)."}
          onMake={(o) => decide(o, unit)}
          onSave={() => decide(null, unit)}
          onCancel={() => { current.current++; queued.current = null; setPhase({ step: "choose" }); }}
        />
      </div>
    );
  }

  if (phase.step === "reading" || phase.step === "saving") {
    const reading = phase.step === "reading";
    // Reading text is quick; reading scanned pages takes a few seconds each, so it gets most of the bar.
    const pct = reading
      ? phase.stage === "scan" ? 12 + (phase.total ? (phase.done / phase.total) * 48 : 0) : phase.total ? (phase.done / phase.total) * 12 : 4
      : 60 + (phase.total ? (phase.done / phase.total) * 40 : 0);
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
          <Step
            state={reading ? "working" : "done"}
            label={reading && phase.photo ? "Reading your photo" : reading && phase.stage === "scan" ? "Reading scanned pages" : !reading && phase.extracted.scannedPages ? "Read scanned pages" : "Reading pages"}
            end={reading ? (phase.total && !phase.photo ? `${phase.done} of ${phase.total}` : phase.stage === "scan" ? "A few seconds" : "Opening") : `${phase.extracted.pages.length} ${pageWord(phase.extracted.kind, phase.extracted.pages.length)}`}
          />
          <Step state={reading ? "waiting" : "working"} label="Saving to your account" end={reading ? "Waiting" : "Working"} />
        </ul>
        <p className="text-center text-[0.875rem] text-muted">
          {reading && phase.stage === "scan" ? "Pages without text are read by our AI, a few seconds each. Your file stays private to you." : "Your file is private to you. Reading happens on this device."}
        </p>
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
          {c.body} {"noRefundLine" in c ? "" : "Nothing was counted."}
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
          <span className="tabular">{uploads.used} of {uploads.limit} study sets made this month. Saving files and reviewing never count.</span>
        ) : (
          "Add notes, slides or a reading."
        )}
      </PageHeader>

      {list.length > 1 && (
        <div className="mb-5 flex flex-col gap-2">
          <span className="field-label">Class</span>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 md:flex-wrap" role="radiogroup" aria-label="Class">
            {list.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={s.id === subject!.id} className="pill-option flex-none" onClick={() => setSubjectId(s.id)}>
                {s.id === subject!.id && <Check />}
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {!online ? (
        <div className="callout neutral"><span><b>Uploading needs a connection.</b> Your saved cards, notes and quizzes still work offline.</span></div>
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
            <span className="text-[0.9375rem] text-muted">PDF (scans too), Word (.docx), text or a photo of notes. Up to {MAX_BYTES / 1024 / 1024} MB.</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            aria-label="Choose a file to upload"
            className="sr-only"
            tabIndex={-1}
            accept=".pdf,.docx,.doc,.txt,.md,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; onFile(f); }}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setPasting(true)}><ClipboardPaste /> Paste text</Button>
            <Button variant="secondary" onClick={() => cameraRef.current?.click()}><Camera /> Take a photo</Button>
            <Button variant="secondary" onClick={() => photosRef.current?.click()}><Images /> Add several photos</Button>
          </div>
          <p className="mt-2 text-[0.875rem] text-muted">Tip: paste a screenshot anywhere on this page.</p>
          {photosInput}
          <input
            ref={cameraRef}
            type="file"
            aria-label="Take a photo of your notes"
            className="sr-only"
            tabIndex={-1}
            accept="image/*"
            capture="environment"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; onFile(f); }}
          />
          <p className="mt-6 text-[0.875rem] text-muted">Your files are private to you. Text is read on this device; scanned pages and photos are read by our AI. The original is stored so you can reopen it.</p>
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
