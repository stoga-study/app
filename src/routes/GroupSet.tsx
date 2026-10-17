import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, LockOpen, Pencil, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { Markdown } from "@/components/Markdown";
import { MathText } from "@/components/MathText";
import { ReportShared } from "@/components/ReportShared";
import { ErrorState, PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { dateFormat } from "@/lib/locale";
import { editSetItem, setLocked, undoSetChange, useSetItems, type SetChange } from "@/lib/queries/groups";
import { ShareError } from "@/lib/queries/share";

const ERR: Record<string, string> = {
  locked: "This set is locked. Only the person who shared it can change it now.",
  changed_since: "Someone changed that again since, so it can't be undone without losing their edit.",
  empty: "A card needs both sides.",
};
const err = (e: unknown) => toast(ERR[(e as ShareError)?.code] ?? "We couldn't save that. Try again.");

function changeText(c: SetChange) {
  const what = c.item_type === "card" ? "a card" : "a note section";
  const field = Object.keys(c.after)[0];
  const after = (c.after[field] ?? "").slice(0, 80);
  return { what, after };
}

/** /groups/:id/sets/:setId: the group's version of a shared set, edited together, with history and Undo. */
export default function GroupSet() {
  const { id, setId } = useParams();
  const items = useSetItems(setId);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"cards" | "notes">("cards");
  if (items.isPending) return <PageSkeleton label="Opening the shared set." />;
  if (items.isError) return <ErrorState title="You can't open this set">You may have left the group, or it was taken down. <Link to="/groups">Your groups</Link>.</ErrorState>;
  const d = items.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["set-items", setId] });
  const save = (type: "card" | "note_section", itemId: string) =>
    editSetItem(setId!, type, itemId, draft).then((r) => { if (!r.unchanged) toast("Saved for everyone in the group."); setEditing(null); return refresh(); }).catch(err);
  const fmt = dateFormat({ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <>
      <Link to={`/groups/${id}`} className="mb-4 inline-flex min-h-11 items-center gap-2 font-bold text-ink-2 no-underline"><ArrowLeft className="size-5" /> Group</Link>
      <h1 className="break-words text-[2rem]">{d.title}</h1>
      <p className="mt-1 text-muted">The group's shared version. {d.can_edit ? "Anyone in the group can fix a card or improve a note; every change can be undone." : "It's locked, so only the person who shared it can change it."} Copies people already added don't change.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {d.locked && <span className="chip chip-neutral"><Lock /> Locked</span>}
        {!d.mine && <ReportShared type="group_set" id={setId!} />}
        {d.can_lock && (
          <Button size="sm" variant="secondary" onClick={() => setLocked(setId!, !d.locked).then(() => { toast(d.locked ? "Unlocked: everyone can edit again." : "Locked: only the sharer can edit now."); return refresh(); }).catch(err)}>
            {d.locked ? <><LockOpen /> Unlock</> : <><Lock /> Lock editing</>}
          </Button>
        )}
      </div>

      <div className="mt-5 flex gap-2" role="tablist" aria-label="Parts">
        <button type="button" role="tab" aria-selected={tab === "cards"} className="pill-option" onClick={() => setTab("cards")}>Cards · {d.cards.length}</button>
        <button type="button" role="tab" aria-selected={tab === "notes"} className="pill-option" onClick={() => setTab("notes")}>Notes · {d.notes.length}</button>
      </div>
      <div role="tabpanel">
      <ul className="mt-3 flex flex-col gap-2">
        {tab === "cards" && d.cards.map((c) => (
          <li key={c.id} className="card p-4">
            {editing === c.id ? (
              <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void save("card", c.id); }}>
                <label className="text-[0.875rem] font-bold" htmlFor={`f-${c.id}`}>Front</label>
                <textarea id={`f-${c.id}`} className="input !min-h-16" maxLength={1000} value={draft.front ?? ""} onChange={(e) => setDraft({ ...draft, front: e.target.value })} />
                <label className="text-[0.875rem] font-bold" htmlFor={`b-${c.id}`}>Back</label>
                <textarea id={`b-${c.id}`} className="input !min-h-16" maxLength={2000} value={draft.back ?? ""} onChange={(e) => setDraft({ ...draft, back: e.target.value })} />
                <div className="flex gap-2"><Button size="sm" type="submit">Save for the group</Button><Button size="sm" variant="secondary" type="button" onClick={() => setEditing(null)}>Cancel</Button></div>
              </form>
            ) : (
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1"><p className="font-bold"><MathText text={c.front} /></p><p className="mt-1 text-ink-2"><MathText text={c.back} /></p></div>
                {d.can_edit && <Button size="sm" variant="ghost" aria-label={`Edit card: ${c.front}`} onClick={() => { setEditing(c.id); setDraft({ front: c.front, back: c.back }); }}><Pencil /></Button>}
              </div>
            )}
          </li>
        ))}
        {tab === "notes" && d.notes.map((n) => (
          <li key={n.id} className="card p-4">
            {editing === n.id ? (
              <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void save("note_section", n.id); }}>
                <label className="text-[0.875rem] font-bold" htmlFor={`t-${n.id}`}>Heading</label>
                <input id={`t-${n.id}`} className="input" maxLength={200} value={draft.title ?? ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                <label className="text-[0.875rem] font-bold" htmlFor={`m-${n.id}`}>Notes</label>
                <textarea id={`m-${n.id}`} className="input !min-h-40" maxLength={20000} value={draft.body_md ?? ""} onChange={(e) => setDraft({ ...draft, body_md: e.target.value })} />
                <div className="flex gap-2"><Button size="sm" type="submit">Save for the group</Button><Button size="sm" variant="secondary" type="button" onClick={() => setEditing(null)}>Cancel</Button></div>
              </form>
            ) : (
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1"><h3 className="text-[1.125rem]">{n.title}</h3><Markdown text={n.body_md} /></div>
                {d.can_edit && <Button size="sm" variant="ghost" aria-label={`Edit notes: ${n.title}`} onClick={() => { setEditing(n.id); setDraft({ title: n.title, body_md: n.body_md }); }}><Pencil /></Button>}
              </div>
            )}
          </li>
        ))}
      </ul>
      </div>

      <section className="card mt-6 p-5" aria-labelledby="history-h">
        <h2 id="history-h" className="text-[1.25rem]">Changes</h2>
        {!d.history.length ? <p className="mt-1 text-muted">No changes yet.</p> : (
          <ul className="mt-2 divide-y divide-line">
            {d.history.map((c) => {
              const t = changeText(c);
              return (
                <li key={c.id} className={cn("flex items-start gap-3 py-2.5", c.undone_at && "text-muted")}>
                  <span className="min-w-0 flex-1 text-[0.9375rem]">
                    <b>{c.display_name}</b> changed {t.what} <span className="text-muted">· {fmt.format(new Date(c.created_at))}</span>
                    <span className={cn("block truncate text-[0.875rem]", c.undone_at && "line-through")}>“{t.after}”</span>
                    {c.undone_at && <span className="block text-[0.8125rem]">Undone by {c.undone_by}</span>}
                  </span>
                  {!c.undone_at && d.can_edit && <Button size="sm" variant="ghost" onClick={() => undoSetChange(c.id).then(() => { toast("Undone."); return refresh(); }).catch(err)}><RotateCcw /> Undo</Button>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
