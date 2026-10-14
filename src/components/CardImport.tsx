import { FileUp } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { MathText } from "@/components/MathText";
import { Button } from "@/components/ui/button";
import { normTag } from "@/lib/cardsOrg";
import { MAX_IMPORT, parseCardImport, type ImportFormat } from "@/lib/cardImport";

const FORMAT_LABEL: Record<ImportFormat, string> = {
  lines: "term - definition lines",
  tabs: "tab-separated (Quizlet or a spreadsheet)",
  csv: "a CSV file",
  anki: "an Anki export",
};

/** Paste or choose a file, see what will be imported, then add every card at once. */
export function CardImport({ className, onImport, onCancel }: { className: string; onImport: (cards: { front: string; back: string }[], tags: string[]) => Promise<unknown>; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const result = text.trim() ? parseCardImport(text, fileName) : null;

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return void toast("That file is over 5 MB. Split it, or paste part of it.");
    setFileName(f.name);
    setText(await f.text());
  }

  return (
    <div className="card mb-6 flex flex-col gap-3 p-5">
      <h2 className="text-[1.25rem]">Import cards into {className}</h2>
      <p className="text-[0.9375rem] text-muted">
        Paste one card per line (<b>term - definition</b>), or choose a CSV, a Quizlet export (Export, then Copy text) or an Anki export (Notes in Plain Text). Up to {MAX_IMPORT} at a time.
      </p>
      <label htmlFor={`imp-${id}`} className="field-label">Cards</label>
      <textarea id={`imp-${id}`} className="input !min-h-40 font-mono text-[0.875rem]" placeholder={"Mitosis - cell division\nMeiosis - makes gametes"} value={text} onChange={(e) => { setText(e.target.value); setFileName(""); }} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()}><FileUp /> Choose a file</Button>
        {fileName && <span className="text-[0.875rem] text-muted">{fileName}</span>}
        <input ref={fileRef} type="file" className="sr-only" tabIndex={-1} aria-label="Choose a file of cards" accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void onFile(f); }} />
      </div>
      <label htmlFor={`tag-${id}`} className="field-label">Tag them (optional)</label>
      <input id={`tag-${id}`} className="input" placeholder="e.g. vocab" maxLength={30} value={tag} onChange={(e) => setTag(e.target.value)} />

      {result && (
        <div className="rounded-2xl bg-soft p-4" aria-live="polite">
          {result.cards.length ? (
            <>
              <p className="font-bold">{result.cards.length} {result.cards.length === 1 ? "card" : "cards"} found, read as {FORMAT_LABEL[result.format]}.</p>
              {result.skipped > 0 && <p className="text-[0.875rem] text-muted">{result.skipped} {result.skipped === 1 ? "line was" : "lines were"} skipped (no clear term and definition{result.cards.length >= MAX_IMPORT ? ", or over the limit" : ""}).</p>}
              <ul className="mt-2 flex flex-col gap-1.5 text-[0.9375rem]">
                {result.cards.slice(0, 5).map((c, i) => (
                  <li key={i} className="truncate"><b><MathText text={c.front} /></b> <span className="text-muted">→</span> <MathText text={c.back} /></li>
                ))}
              </ul>
              {result.cards.length > 5 && <p className="mt-1 text-[0.875rem] text-muted">and {result.cards.length - 5} more</p>}
            </>
          ) : (
            <p>No cards found yet. Put a term, a dash, then its definition on each line.</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || !result?.cards.length}
          onClick={async () => {
            if (!result) return;
            setBusy(true);
            try {
              const t = normTag(tag);
              await onImport(result.cards, t ? [t] : []);
            } catch {
              toast("That did not save. Check your connection, then try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Importing…" : result?.cards.length ? `Import ${result.cards.length} ${result.cards.length === 1 ? "card" : "cards"}` : "Import"}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </div>
  );
}
