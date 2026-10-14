import { CalendarDays, Check, ClipboardCheck, FolderKanban, ListChecks, NotebookPen, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { isExam, type EventDraft, type EventKind } from "@/lib/queries/events";
import type { Subject } from "@/lib/queries/profile";
import { useUnits } from "@/lib/queries/units";
import { unitName } from "@/lib/units";

export const KINDS: { kind: EventKind; label: string; icon: ReactNode }[] = [
  { kind: "test", label: "Test", icon: <ClipboardCheck /> },
  { kind: "quiz", label: "Quiz", icon: <ListChecks /> },
  { kind: "homework", label: "Homework", icon: <NotebookPen /> },
  { kind: "project", label: "Project", icon: <FolderKanban /> },
  { kind: "other", label: "Other", icon: <CalendarDays /> },
];
export const kindMeta = (k: EventKind) => KINDS.find((x) => x.kind === k)!;

/** Add or change a calendar item: what kind, what, which class (and units, for tests and quizzes), when. */
export function EventForm({ initial, subjects, busy, onSave, onCancel, onDelete }: {
  initial: EventDraft;
  subjects: Subject[];
  busy?: boolean;
  onSave: (d: EventDraft) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [d, setD] = useState(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const units = useUnits(d.subject_id ?? undefined);
  const set = (patch: Partial<EventDraft>) => setD((x) => ({ ...x, ...patch }));
  const title = d.title.replace(/\s+/g, " ").trim();
  const placeholder = { test: "Unit 4 test", quiz: "Vocab quiz", homework: "Problems 1–20, page 112", project: "Lab report", other: "Study group" }[d.kind];

  return (
    <form
      className="card flex flex-col gap-4 p-5"
      aria-label={onDelete ? "Change this item" : "Add to your calendar"}
      onSubmit={(e) => {
        e.preventDefault();
        if (!title || !d.due_on) return;
        onSave({ ...d, title: title.slice(0, 120), notes: d.notes?.trim() ? d.notes.trim().slice(0, 1000) : null });
      }}
    >
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kind">
        {KINDS.map((k) => (
          <button key={k.kind} type="button" role="radio" aria-checked={d.kind === k.kind} className="pill-option" onClick={() => set({ kind: k.kind })}>
            {k.icon} {k.label}
          </button>
        ))}
      </div>
      <div>
        <label htmlFor="ev-title" className="mb-1 block font-bold">What is it?</label>
        <input id="ev-title" className="input w-full" required maxLength={120} placeholder={placeholder} value={d.title} onChange={(e) => set({ title: e.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ev-class" className="mb-1 block font-bold">Class</label>
          <select id="ev-class" className="input w-full" value={d.subject_id ?? ""} onChange={(e) => set({ subject_id: e.target.value || null, unit_ids: [] })}>
            <option value="">No class</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div>
            <label htmlFor="ev-date" className="mb-1 block font-bold">{isExam(d.kind) ? "Date" : "Due"}</label>
            <input id="ev-date" type="date" className="input w-full" required value={d.due_on} onChange={(e) => set({ due_on: e.target.value })} />
          </div>
          <div>
            <label htmlFor="ev-time" className="mb-1 block font-bold">Time <span className="font-normal text-muted">(optional)</span></label>
            <input id="ev-time" type="time" className="input w-full" value={d.due_time?.slice(0, 5) ?? ""} onChange={(e) => set({ due_time: e.target.value || null })} />
          </div>
        </div>
      </div>
      {isExam(d.kind) && d.subject_id && (units.data?.length ?? 0) > 0 && (
        <fieldset>
          <legend className="mb-1 font-bold">Units it covers <span className="font-normal text-muted">(helps plan your studying)</span></legend>
          <div className="flex flex-wrap gap-2">
            {units.data!.map((u) => {
              const on = d.unit_ids.includes(u.id);
              return (
                <button key={u.id} type="button" aria-pressed={on} className="pill-option" onClick={() => set({ unit_ids: on ? d.unit_ids.filter((x) => x !== u.id) : [...d.unit_ids, u.id] })}>
                  {on && <Check />}{unitName(u)}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
      <div>
        <label htmlFor="ev-notes" className="mb-1 block font-bold">Notes <span className="font-normal text-muted">(optional)</span></label>
        <textarea id="ev-notes" className="input w-full !min-h-20" maxLength={1000} value={d.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy || !title || !d.due_on}>{onDelete ? "Save changes" : "Add to calendar"}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        {onDelete && (
          confirmDelete ? (
            <span className="ml-auto flex items-center gap-2">
              <span className="text-[0.9375rem]">Delete it?</span>
              <Button type="button" size="sm" onClick={onDelete}>Delete</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setConfirmDelete(false)}>Keep</Button>
            </span>
          ) : (
            <Button type="button" variant="ghost" className="ml-auto" onClick={() => setConfirmDelete(true)}><Trash2 /> Delete</Button>
          )
        )}
      </div>
    </form>
  );
}
