import { Check, FolderOpen, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Unit, UnitChoice } from "@/lib/queries/units";
import { unitName } from "@/lib/units";

/** How a choice reads: "Unit 11 · The French Revolution", plus whether it is new. */
export function choiceName(c: UnitChoice, units: Unit[]) {
  if (c.kind === "none") return "No unit";
  if (c.kind === "new") return unitName(c);
  const u = units.find((x) => x.id === c.id);
  return u ? unitName(u) : "Unit";
}

/** A lesson only belongs to a unit with the same number ("11.1" goes with Unit 11). */
const lessonFor = (lesson: string | null | undefined, number: string | null) => (lesson && number && lesson.split(".")[0] === number ? lesson : null);

/**
 * "Filed under Unit 11 · Change", or, when nothing is chosen yet, the question itself.
 * The class's units, a new unit (number and/or title), or no unit.
 */
export function UnitPicker({
  units, value, onChange, lesson, word = "Unit", why, startOpen,
}: {
  units: Unit[];
  value: UnitChoice | null;
  onChange: (c: UnitChoice) => void;
  /** A lesson found in the file ("11.1"), kept when the student picks its unit. */
  lesson?: string | null;
  /** The word the file used ("Chapter"), for a new unit. */
  word?: string;
  /** Shown above the choices when they are open, e.g. why we are asking. */
  why?: string;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!startOpen);
  const [adding, setAdding] = useState(false);
  const [num, setNum] = useState("");
  const [title, setTitle] = useState("");
  const showing = open || !value;

  function pick(c: UnitChoice) {
    onChange(c);
    setOpen(false);
    setAdding(false);
  }

  function addNew() {
    const n = num.replace(/\D/g, "").slice(0, 3) || null;
    const t = title.trim().slice(0, 80) || null;
    if (!n && !t) return;
    const have = n ? units.find((u) => u.number === n) : null;
    if (have) pick({ kind: "existing", id: have.id, lesson: lessonFor(lesson, n) });
    else pick({ kind: "new", number: n, title: t, word, lesson: lessonFor(lesson, n) });
  }

  if (!showing && value) {
    const isNew = value.kind === "new";
    const l = value.kind === "none" ? null : value.lesson;
    return (
      <div className="card flex items-center gap-3 p-4">
        <span className="tile soft !size-10 [&_svg]:!size-5"><FolderOpen /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.8125rem] font-bold text-muted">{value.kind === "none" ? "Unit" : "Filed under"}</span>
          <span className="block truncate font-bold">
            {choiceName(value, units)}
            {isNew && <span className="ml-1.5 font-normal text-muted">(new)</span>}
          </span>
          {l && <span className="mt-1 inline-block rounded-full bg-soft px-2 py-0.5 text-[0.8125rem] font-bold">Lesson {l}</span>}
        </span>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Change</Button>
      </div>
    );
  }

  const selected = (c: UnitChoice) =>
    !!value && value.kind === c.kind && (c.kind !== "existing" || (value.kind === "existing" && value.id === c.id));

  return (
    <section className="card flex flex-col gap-3 p-4" aria-labelledby="unit-q">
      <div>
        <h2 id="unit-q" className="text-[1.125rem]">Which unit is this?</h2>
        {why && <p className="text-[0.9375rem] text-muted">{why}</p>}
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="unit-q">
        {units.map((u) => {
          const c: UnitChoice = { kind: "existing", id: u.id, lesson: lessonFor(lesson, u.number) };
          return (
            <button key={u.id} type="button" role="radio" aria-checked={selected(c)} className="pill-option" onClick={() => pick(c)}>
              {selected(c) && <Check />}{unitName(u)}
            </button>
          );
        })}
        {value?.kind === "new" && (
          <button type="button" role="radio" aria-checked className="pill-option" onClick={() => pick(value)}>
            <Check />{unitName(value)} (new)
          </button>
        )}
        <button type="button" role="radio" aria-checked={adding} className="pill-option" onClick={() => setAdding(true)}>
          <Plus />New unit
        </button>
        <button type="button" role="radio" aria-checked={value?.kind === "none"} className="pill-option" onClick={() => pick({ kind: "none" })}>
          {value?.kind === "none" && <Check />}No unit
        </button>
      </div>
      {adding && (
        <div className="flex flex-col gap-3 rounded-2xl bg-soft p-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex w-24 flex-col gap-1.5">
              <label htmlFor="unit-num" className="field-label">{word} number</label>
              <input id="unit-num" className="input" inputMode="numeric" placeholder="11" maxLength={3} value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="flex min-w-48 flex-1 flex-col gap-1.5">
              <label htmlFor="unit-title" className="field-label">Name (optional)</label>
              <input id="unit-title" className="input" placeholder="e.g. The French Revolution" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNew()} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={!num && !title.trim()} onClick={addNew}>Use this unit</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {value && open && <Button variant="ghost" size="sm" className="self-start" onClick={() => { setOpen(false); setAdding(false); }}>Keep {choiceName(value, units)}</Button>}
    </section>
  );
}
