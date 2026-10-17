import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildExport } from "@/lib/exportData";

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
    </div>
  );
}
