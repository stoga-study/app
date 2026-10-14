import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Check, RotateCcw, Trash2, WifiOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { Markdown } from "@/components/Markdown";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { askCoach, CoachError, loadCoach, saveCoach, undoCoach, type CoachMessage } from "@/lib/queries/coach";
import { usePlan } from "@/lib/queries/plan";
import { useOnline } from "@/lib/useOnline";

const STARTERS = ["What should I study tonight?", "I have a test on Friday", "I'm stressed about my tests", "Plan my week"];

/**
 * The coach: a study-planning chat that can add, move, tick off and remove calendar items, and set a
 * class's current unit. Each change shows as a card with Undo. `?say=` starts with that message.
 */
export default function Coach() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const [msgs, setMsgs] = useState<CoachMessage[]>(() => loadCoach(userId));
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams();
  const plan = usePlan();
  const online = useOnline();
  const qc = useQueryClient();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => saveCoach(userId, msgs), [userId, msgs]);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [msgs.length, busy]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["subjects"] });
  };

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    const before = msgs;
    setMsgs([...before, { role: "user", content: message }]);
    setDraft("");
    setBusy(true);
    try {
      const planToday = plan.ready ? (plan.days[0]?.tasks ?? []).map((t) => `${t.title}${t.done ? " (done)" : ""}`) : [];
      const r = await askCoach(message, before, planToday);
      setMsgs((m) => [...m, { role: "assistant", content: r.reply, actions: r.actions, crisis: r.crisis }]);
      if (r.actions.some((a) => a.ok)) refresh();
    } catch (e) {
      const code = e instanceof CoachError ? e.code : "unavailable";
      setMsgs(before);
      setDraft(message);
      toast(
        code === "limit" ? "You've used today's tutor and coach messages. They come back tomorrow."
          : code === "offline" ? "The coach needs a connection."
            : code === "busy" ? "The coach is busy right now. Try again in a minute."
              : "The coach couldn't answer just now. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }

  // ?say= from the Home card or a button elsewhere: send it once.
  const say = params.get("say");
  const said = useRef<string | null>(null);
  useEffect(() => {
    if (!say || said.current === say) return;
    said.current = say;
    // After this render, so the message goes through send() like any other.
    void Promise.resolve().then(() => {
      setParams({}, { replace: true });
      return send(say);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [say]);

  async function undo(mi: number, ai: number) {
    const a = msgs[mi].actions?.[ai];
    if (!a?.undo || a.undone) return;
    try {
      await undoCoach(a.undo);
      setMsgs((m) => m.map((x, i) => (i !== mi ? x : { ...x, actions: x.actions!.map((y, j) => (j === ai ? { ...y, undone: true } : y)) })));
      refresh();
    } catch {
      toast("We couldn't undo that. Check your connection, then try again.");
    }
  }

  return (
    <section className="mx-auto flex max-w-2xl flex-col" aria-label="Coach">
      <PageHeader
        title="Coach"
        end={msgs.length > 0 && <Button variant="ghost" size="sm" onClick={() => setMsgs([])}><Trash2 /> Clear chat</Button>}
      >
        Plan your week, sort out what's due, or just talk through a stressful test. It can add things to your calendar too.
      </PageHeader>

      <div className="flex flex-col gap-3" aria-live="polite">
        {msgs.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((s) => <button key={s} type="button" className="pill-option" disabled={!online} onClick={() => void send(s)}>{s}</button>)}
          </div>
        )}
        {msgs.map((m, mi) =>
          m.role === "user" ? (
            <div key={mi} className="max-w-[88%] self-end whitespace-pre-line rounded-[1.25rem] rounded-br-md border-2 border-line bg-card p-3">{m.content}</div>
          ) : (
            <div key={mi} className="flex max-w-[94%] flex-col gap-2">
              <div className={cn("rounded-[1.25rem] rounded-bl-md p-4", m.crisis ? "border-2 border-hot bg-card" : "bg-tint")}>
                <Markdown text={m.content} />
              </div>
              {m.actions?.map((a, ai) => (
                <div key={ai} className={cn("card flex items-center gap-3 !rounded-[1rem] px-4 py-2.5 !shadow-none", !a.ok && "card-dashed")}>
                  {a.ok && !a.undone ? <Check className="size-5 flex-none text-brand" aria-hidden="true" /> : <X className="size-5 flex-none text-muted" aria-hidden="true" />}
                  <span className={cn("min-w-0 flex-1 text-[0.9375rem]", (a.undone || !a.ok) && "text-muted", a.undone && "line-through")}>{a.summary}</span>
                  {a.ok && a.undo && (a.undone ? <span className="text-[0.875rem] font-bold text-muted">Undone</span> : (
                    <Button variant="ghost" size="sm" onClick={() => void undo(mi, ai)}><RotateCcw /> Undo</Button>
                  ))}
                </div>
              ))}
            </div>
          ),
        )}
        {busy && <div className="skeleton h-16 w-2/3 rounded-[1.25rem]" aria-label="The coach is writing" />}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] mt-4 border-t border-line bg-bg pt-3 lg:bottom-0 lg:pb-4">
        {!online && <p className="mb-2 text-center text-[0.8125rem] text-muted"><span className="inline-flex items-center gap-1"><WifiOff className="size-4" /> The coach needs a connection.</span></p>}
        <form onSubmit={(e) => { e.preventDefault(); void send(draft); }} className="flex items-end gap-2 rounded-[1.5rem] border-2 border-line bg-card p-2 focus-within:border-hot">
          <label htmlFor="coach-say" className="sr-only">Message the coach</label>
          <textarea
            id="coach-say"
            rows={1}
            value={draft}
            maxLength={1000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(draft); } }}
            placeholder="Like “bio test friday on unit 4”"
            className="max-h-40 min-h-11 flex-1 resize-none border-0 bg-transparent px-3 py-2.5 outline-none"
          />
          <button type="submit" disabled={!draft.trim() || busy || !online} aria-label="Send" className="grid size-11 flex-none place-items-center rounded-full bg-primary text-white disabled:bg-line disabled:text-muted">
            <ArrowUp className="size-5" />
          </button>
        </form>
      </div>
    </section>
  );
}
