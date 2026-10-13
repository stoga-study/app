import { BookOpen, Check, Layers, ListChecks, Minus, NotebookPen, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { NONE, PARTS, suggestAmounts, type Caps, type Counted, type GenOptions, type Part } from "../../supabase/functions/_lib/options";

const INFO: Record<Part, { label: string; desc: string; again: string; unit?: string; icon: ReactNode }> = {
  notes: { label: "Notes", desc: "Organized notes, linked to your pages", again: "Remake notes", icon: <NotebookPen /> },
  cards: { label: "Flashcards", desc: "Reviewed with spaced repetition", again: "More flashcards", unit: "cards", icon: <Layers /> },
  quiz: { label: "Practice quiz", desc: "Multiple choice, with explanations", again: "Another practice quiz", unit: "questions", icon: <ListChecks /> },
  guide: { label: "Study guide", desc: "Short lessons in a sensible order", again: "Remake study guide", unit: "sections", icon: <BookOpen /> },
};

/**
 * "What should we make?": the parts of a study set and how much of each, within the plan's caps.
 * Amounts start from a suggestion sized to the file, and the student can change any of them.
 */
export function StudySetChooser({
  chars, caps, initial, mode, existing, busy, reading, blocked, needs, onMake, onSave, onCancel,
}: {
  /** Characters of text in the file, or null while it is still being read. */
  chars: number | null;
  caps: Caps;
  /** Parts ticked to start with (the class's last choice), or none. */
  initial?: Partial<Record<Part, boolean>> | null;
  /** "upload": a new file, with "Just save it". "more": add to an existing study set. */
  mode: "upload" | "more";
  /** Parts this file already has (changes the labels in "more" mode). */
  existing?: Partial<Record<Part, boolean>>;
  busy?: boolean;
  /** Shown while the file is still being read, e.g. "Reading page 3 of 12". */
  reading?: string | null;
  /** Why making is not possible right now (e.g. this month's study sets are used); saving still works. */
  blocked?: string | null;
  /** Something to answer first (e.g. which unit); both buttons wait for it. */
  needs?: string | null;
  onMake: (options: GenOptions) => void;
  onSave?: () => void;
  onCancel?: () => void;
}) {
  const [parts, setParts] = useState<Record<Part, boolean>>({ ...NONE, ...(initial ?? {}) });
  // Numbers the student changed; anything else follows the suggestion for this file.
  const [chosen, setChosen] = useState<Partial<Record<Counted, number>>>({});
  const suggested = chars == null ? null : suggestAmounts(chars, caps);
  const amount = (k: Counted) => chosen[k] ?? suggested?.[k] ?? null;
  const set = (k: Counted, n: number) => setChosen((c) => ({ ...c, [k]: Math.max(1, Math.min(caps[k], Math.round(n) || 1)) }));
  const any = PARTS.some((p) => parts[p]);
  const ready = PARTS.every((p) => !parts[p] || p === "notes" || amount(p as Counted) != null);

  function make() {
    const a = (k: Counted) => (parts[k] ? (amount(k) ?? 1) : 0);
    onMake({ parts, amounts: { cards: a("cards"), quiz: a("quiz"), guide: a("guide") } });
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="chooser-title">
      <div>
        <h2 id="chooser-title" className="text-[1.375rem]">{mode === "upload" ? "What should we make?" : "Make more from this file"}</h2>
        <p className="text-[0.9375rem] text-muted">
          {mode === "upload" ? "Pick any, or just save the file to read and write your own notes." : "Pick what to add. Everything you already have stays."}
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {PARTS.map((p) => {
          const on = parts[p];
          const info = INFO[p];
          const counted = p === "notes" ? null : (p as Counted);
          const n = counted ? amount(counted) : null;
          return (
            <li key={p} className={cn("card !shadow-none overflow-hidden", on && "!border-primary")}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => setParts((s) => ({ ...s, [p]: !s[p] }))}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <span className={cn("grid size-6 flex-none place-items-center rounded-md border-2", on ? "border-primary bg-primary text-white" : "border-line-strong")}>
                  {on && <Check className="size-3.5" />}
                </span>
                <span className="tile soft !size-10 [&_svg]:!size-5">{info.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{mode === "more" && existing?.[p] ? info.again : info.label}</span>
                  <span className="block text-[0.875rem] text-muted">{info.desc}</span>
                </span>
              </button>
              {on && counted && (
                <div className="flex flex-wrap items-center gap-3 border-t border-line bg-soft px-4 py-3">
                  <span id={`amt-${p}`} className="text-[0.9375rem] font-bold">How many {info.unit}?</span>
                  <div className="ml-auto flex items-center gap-2" role="group" aria-labelledby={`amt-${p}`}>
                    <Button variant="secondary" size="sm" aria-label={`Fewer ${info.unit}`} disabled={n == null || n <= 1} onClick={() => n != null && set(counted, n - 1)}><Minus /></Button>
                    <input
                      className="input !min-h-10 w-20 text-center tabular"
                      inputMode="numeric"
                      aria-label={`Number of ${info.unit}`}
                      value={n ?? ""}
                      placeholder="…"
                      onChange={(e) => { const v = Number(e.target.value.replace(/\D/g, "")); if (v) set(counted, v); }}
                    />
                    <Button variant="secondary" size="sm" aria-label={`More ${info.unit}`} disabled={n == null || n >= caps[counted]} onClick={() => n != null && set(counted, n + 1)}><Plus /></Button>
                  </div>
                  <span className="w-full text-[0.8125rem] text-muted">
                    {n == null ? "Sizing it to your file…" : `Up to ${caps[counted]} on your plan${suggested && chosen[counted] == null ? ". Suggested for this file." : "."}`}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {reading && <p className="text-center text-[0.875rem] text-muted" aria-live="polite">{reading}</p>}
      {blocked && <p className="callout">{blocked}</p>}
      {needs && <p className="text-[0.875rem] text-muted">{needs}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!any || !ready || busy || !!blocked || !!needs} onClick={make}>{busy ? "Starting…" : mode === "upload" ? "Make it" : "Make these"}</Button>
        {onSave && <Button variant="secondary" disabled={busy || !!needs} onClick={onSave}>Just save it</Button>}
        {onCancel && <Button variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>}
      </div>
    </section>
  );
}
