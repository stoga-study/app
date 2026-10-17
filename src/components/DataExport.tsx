import { useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/session";
import { buildExport } from "@/lib/exportData";
import { dateFormat } from "@/lib/locale";
import { BackupError, readBackup, restoreBackup, summarize, type Backup } from "@/lib/restoreData";

/** Download everything as one zip, built on this device. */
export function DataExport() {
  const [includeFiles, setIncludeFiles] = useState(false);
  const [step, setStep] = useState<string | null>(null);

  async function run() {
    setStep("Starting");
    try {
      const blob = await buildExport({ includeFiles, onStep: setStep });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stoga-study-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success("Your data is downloading");
    } catch {
      toast.error("Couldn't gather everything. Check your connection and try again.");
    } finally {
      setStep(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">
        One zip with your notes and study sets as Markdown, your flashcards as a spreadsheet and for Anki, your quizzes, and your calendar
        for Google, Apple or Outlook. It's made on this device; nothing is sent anywhere.
      </p>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={includeFiles} onChange={(e) => setIncludeFiles(e.target.checked)} disabled={!!step} />
        Include my original files (bigger download)
      </label>
      <Button variant="secondary" className="self-start" onClick={run} disabled={!!step}>
        <Download /> {step ? "Preparing…" : "Download my data"}
      </Button>
      <p className="field-hint" role="status" aria-live="polite">{step ? `${step}…` : ""}</p>
      <hr className="border-line" />
      <Restore />
    </div>
  );
}

const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** Bring a backup back: into this account, or a new one. Adds what's missing; never changes what's here. */
function Restore() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [step, setStep] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      setBackup(await readBackup(file));
    } catch (e) {
      toast.error(e instanceof BackupError ? e.message : "That file couldn't be read.");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  async function restore() {
    if (!backup || !session) return;
    setStep("Starting");
    try {
      const r = await restoreBackup(backup, session.user.id, setStep);
      await qc.invalidateQueries();
      setBackup(null);
      if (!r.added && r.existed) toast.success("Everything in that backup is already here");
      else toast.success(`Restored ${n(r.added, "item")}${r.skipped ? `. ${n(r.skipped, "item")} couldn't be brought back` : ""}`);
    } catch {
      toast.error("The restore stopped partway. Run it again: anything already brought back is skipped.");
    } finally {
      setStep(null);
    }
  }

  const sum = backup ? summarize(backup) : null;
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[1.0625rem] font-semibold">Restore from a backup</h3>
      <p className="text-muted">Choose a zip from Download my data (or its data.json). What's missing is added back; nothing you have now is changed or removed.</p>
      <input ref={input} type="file" accept=".zip,.json,application/zip,application/json" className="sr-only" aria-label="Choose a backup file" onChange={(e) => pick(e.target.files?.[0])} />
      {!sum ? (
        <Button variant="secondary" className="self-start" onClick={() => input.current?.click()}><Upload /> Choose a backup</Button>
      ) : (
        <div className="card !rounded-[1rem] p-4 !shadow-none">
          <p>
            From {dateFormat({ month: "long", day: "numeric", year: "numeric" }).format(new Date(sum.exportedAt))}: {n(sum.classes, "class", "classes")}, {n(sum.files, "file")}
            {sum.originals ? ` (${sum.originals} with the original)` : ""}, {n(sum.cards, "flashcard")}, {n(sum.notes, "note")} and {n(sum.events, "calendar item")}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={restore} disabled={!!step}>{step ? "Restoring…" : "Restore"}</Button>
            <Button variant="ghost" onClick={() => setBackup(null)} disabled={!!step}>Cancel</Button>
          </div>
        </div>
      )}
      <p className="field-hint" role="status" aria-live="polite">{step ? `${step}…` : ""}</p>
    </div>
  );
}
