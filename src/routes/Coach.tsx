import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ArrowUp, CalendarPlus, Check, ChevronDown, Layers, ListChecks, Palette, RotateCcw, Sparkles, Square, Trash2, TrendingUp, WifiOff, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { loadCoach, saveCoach, streamCoach, undoCoach, type CoachEvent, type CoachMessage } from "@/lib/queries/coach";
import { usePlan } from "@/lib/queries/plan";
import { useFaces, useProfile } from "@/lib/queries/profile";
import { Face } from "@/components/Face";
import { useOnline } from "@/lib/useOnline";

const STARTERS: { icon: ReactNode; text: string }[] = [
  { icon: <Sparkles />, text: "What should I study tonight?" },
  { icon: <TrendingUp />, text: "How am I doing in my classes?" },
  { icon: <Layers />, text: "Make flashcards from my latest notes" },
  { icon: <ListChecks />, text: "Quiz me on what I keep getting wrong" },
  { icon: <CalendarPlus />, text: "I have a test on Friday" },
  { icon: <ArrowRight />, text: "Plan my week" },
];

const ERRORS: Record<string, string> = {
  limit: "You've used today's tutor and coach messages. They come back tomorrow.",
  offline: "The coach needs a connection.",
  busy: "The coach is busy right now. Try again in a minute.",
};

/** Reveals streamed text at a steady pace, catching up when it falls behind, so it flows instead of jumping. */
function SmoothText({ text, live }: { text: string; live: boolean }) {
  const [shown, setShown] = useState(live ? 0 : text.length);
  const target = useRef(text);
  useEffect(() => {
    target.current = text;
  }, [text]);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setShown((n) => {
        const left = target.current.length - n;
        return left <= 0 ? n : n + Math.max(1, Math.ceil(left / 10));
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const visible = text.slice(0, Math.min(shown, text.length));
  return (
    <div>
      <Markdown text={visible} />
      {(live || shown < text.length) && <span className="coach-caret" aria-hidden="true" />}
    </div>
  );
}

function Steps({ m }: { m: CoachMessage }) {
  const steps = m.steps ?? [];
  const running = steps.some((s) => s.status === "running");
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;
  if (!running && !open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rise inline-flex items-center gap-1.5 self-start text-[0.875rem] font-bold text-muted hover:text-ink">
        <Check className="size-4 text-brand" /> Looked at {steps.length} {steps.length === 1 ? "thing" : "things"} <ChevronDown className="size-4" />
      </button>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5" aria-label="What the coach is doing">
      {steps.map((s) => (
        <li key={s.id} className="rise flex items-center gap-2 text-[0.9375rem]">
          {s.status === "running" ? <span className="coach-spin flex-none" aria-hidden="true" /> : s.status === "done" ? <Check className="check-in size-4 flex-none text-brand" aria-hidden="true" /> : <X className="check-in size-4 flex-none text-hot" aria-hidden="true" />}
          <span className={s.status === "running" ? "shimmer-text font-bold" : "text-muted"}>{s.label}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The coach: an assistant over the student's own study material. It looks things up (notes, files,
 * progress, mistakes, hardest cards), acts (calendar, flashcards, notes, buttons to start things) with
 * Undo on every change, and streams its answer. `?say=` starts with that message.
 */
export default function Coach() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const profile = useProfile();
  const { coach } = useFaces();
  const [msgs, setMsgs] = useState<CoachMessage[]>(() => loadCoach(userId));
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams();
  const plan = usePlan();
  const online = useOnline();
  const qc = useQueryClient();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    saveCoach(userId, msgs);
  }, [userId, msgs]);
  // Follow the answer as it grows, unless the student scrolled up to read.
  const last = msgs.at(-1);
  const growth = `${msgs.length}:${last?.content.length ?? 0}:${last?.steps?.length ?? 0}:${last?.actions?.length ?? 0}`;
  useEffect(() => {
    const nearBottom = window.innerHeight + window.scrollY > document.body.scrollHeight - 240;
    if (nearBottom) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [growth]);
  // The box grows with what's typed.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  const refresh = () => ["events", "subjects", "due-cards", "class-cards", "notes", "plan-cards", "mastery-cards"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    const before = msgs;
    setMsgs([...before, { role: "user", content: message }, { role: "assistant", content: "", steps: [], actions: [], links: [], live: true }]);
    setDraft("");
    setBusy(true);
    const ctl = new AbortController();
    abort.current = ctl;
    const patch = (fn: (m: CoachMessage) => CoachMessage) => setMsgs((ms) => ms.map((m, i) => (i === ms.length - 1 ? fn(m) : m)));
    let changed = false;
    let failed: string | null = null;
    const planToday = plan.ready ? (plan.days[0]?.tasks ?? []).map((t) => `${t.title}${t.done ? " (done)" : ""}`) : [];
    let heard = false;
    const onEvent = (e: CoachEvent) => {
      if (e.type !== "error") heard = true;
      if (e.type === "step") {
        patch((m) => {
          const steps = m.steps ?? [];
          return steps.some((s) => s.id === e.id)
            ? { ...m, steps: steps.map((s) => (s.id === e.id ? { ...s, status: e.status } : s)) }
            : { ...m, steps: [...steps, { id: e.id, label: e.label ?? "Working", status: e.status }] };
        });
      } else if (e.type === "action") {
        if (e.ok) changed = true;
        patch((m) => ({ ...m, actions: [...(m.actions ?? []), { type: e.action, summary: e.summary, ok: e.ok, undo: e.undo }] }));
      } else if (e.type === "link") {
        patch((m) => ({ ...m, links: [...(m.links ?? []), { label: e.label, href: e.href }] }));
      } else if (e.type === "delta") {
        patch((m) => ({ ...m, content: m.content + e.text }));
      } else if (e.type === "done") {
        patch((m) => ({ ...m, content: e.reply, crisis: e.crisis, live: false }));
      } else if (e.type === "error") {
        failed = e.error;
      }
    };
    await streamCoach(message, before, planToday, onEvent, ctl.signal);
    // A hiccup before anything arrived (nothing was looked up or changed yet): try once more by itself.
    if (failed && !heard && ["unavailable", "busy", "interrupted"].includes(failed) && !ctl.signal.aborted) {
      failed = null;
      await new Promise((r) => setTimeout(r, 1500));
      if (!ctl.signal.aborted) await streamCoach(message, before, planToday, onEvent, ctl.signal);
    }
    abort.current = null;
    setBusy(false);
    if (changed) refresh();
    if (failed === "stopped") {
      patch((m) => ({ ...m, live: false, content: m.content || "Stopped." }));
    } else if (failed) {
      const code: string = failed;
      // Nothing came back: put the message back to try again. A half-written answer stays as it is.
      setMsgs((ms) => {
        const lastMsg = ms.at(-1);
        if (lastMsg && !lastMsg.content && !lastMsg.actions?.length) return before;
        return ms.map((m, i) => (i === ms.length - 1 ? { ...m, live: false } : m));
      });
      setDraft((d) => d || message);
      toast(ERRORS[code] ?? "The coach couldn't answer just now. Try again in a moment.");
    } else {
      patch((m) => ({ ...m, live: false }));
    }
  }

  // ?say= from the Home card or a button elsewhere: send it once.
  const say = params.get("say");
  const said = useRef<string | null>(null);
  useEffect(() => {
    if (!say || said.current === say) return;
    said.current = say;
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

  const name = profile.data?.first_name;
  return (
    <section className="mx-auto flex min-h-[calc(100dvh-12rem)] max-w-2xl flex-col" aria-label="Coach">
      {msgs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 py-8 text-center">
          <Link to="/coach/customize" aria-label={`Customize ${coach.name}`} className="face-hop rounded-full shadow-[0_12px_40px_-12px_color-mix(in_srgb,var(--hot)_45%,transparent)] transition-transform hover:scale-105">
            <Face face={coach.face} size={104} mood="idle" />
          </Link>
          <div className="rise">
            <h1 className="text-[2.25rem] leading-tight md:text-[2.75rem]">{name ? `Hey ${name}, I'm ${coach.name}.` : `Hey, I'm ${coach.name}.`}</h1>
            <p className="mt-2 text-[1.0625rem] text-muted">I can see your classes, notes, cards and calendar. What do you need?</p>
            <Link to="/coach/customize" className="mt-2 inline-flex items-center gap-1.5 text-[0.9375rem] font-bold"><Palette className="size-4" /> Customize me</Link>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2">
            {STARTERS.map((s, i) => (
              <button
                key={s.text}
                type="button"
                disabled={!online}
                onClick={() => void send(s.text)}
                className="rise card flex items-center gap-3 !rounded-[1rem] px-4 py-3 text-left font-bold !shadow-none transition-transform hover:-translate-y-0.5 hover:!border-primary [&_svg]:size-5 [&_svg]:flex-none [&_svg]:text-brand"
                style={{ animationDelay: `${120 + i * 50}ms` }}
              >
                {s.icon}
                <span>{s.text}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h1 className="flex items-center gap-2 text-[1.5rem]"><Face face={coach.face} size={36} mood={busy ? "thinking" : "idle"} /> {coach.name}</h1>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" asChild><Link to="/coach/customize" aria-label={`Customize ${coach.name}`}><Palette /></Link></Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setMsgs([])}><Trash2 /> New chat</Button>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-5" aria-live="polite">
            {msgs.map((m, mi) =>
              m.role === "user" ? (
                <div key={mi} className="rise max-w-[85%] self-end whitespace-pre-line rounded-[1.25rem] rounded-br-md bg-tint px-4 py-3">{m.content}</div>
              ) : (
                <div key={mi} className="flex gap-3">
                  <Face face={coach.face} size={30} className="mt-0.5" mood={!m.live ? (mi === msgs.length - 1 ? "idle" : "still") : m.content ? "talking" : "thinking"} />
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    {m.live && !m.content && !m.steps?.length && <p className="shimmer-text font-bold">Thinking…</p>}
                    <Steps m={m} />
                    {(m.actions?.length ?? 0) > 0 && (
                      <div className="flex flex-col gap-2">
                        {m.actions!.map((a, ai) => (
                          <div key={ai} className={cn("rise card flex items-center gap-3 !rounded-[1rem] px-4 py-2.5 !shadow-none", !a.ok && "card-dashed")} style={{ animationDelay: `${ai * 70}ms` }}>
                            {a.ok && !a.undone ? <Check className="check-in size-5 flex-none text-brand" aria-hidden="true" /> : <X className="size-5 flex-none text-muted" aria-hidden="true" />}
                            <span className={cn("min-w-0 flex-1 text-[0.9375rem]", (a.undone || !a.ok) && "text-muted", a.undone && "line-through")}>{a.summary}</span>
                            {a.ok && a.undo && (a.undone ? <span className="text-[0.875rem] font-bold text-muted">Undone</span> : (
                              <Button variant="ghost" size="sm" onClick={() => void undo(mi, ai)}><RotateCcw /> Undo</Button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                    {(m.content || (m.live && (m.steps?.length ?? 0) > 0 && !m.steps!.some((s) => s.status === "running"))) && (
                      <div className={cn(m.crisis && "rounded-[1rem] border-2 border-hot p-4")}>
                        {m.content ? <SmoothText text={m.content} live={!!m.live} /> : <p className="shimmer-text font-bold">Writing…</p>}
                      </div>
                    )}
                    {(m.links?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {m.links!.map((l, li) => (
                          <Button key={li} asChild size="sm" variant={li === 0 ? "primary" : "secondary"} className="rise" style={{ animationDelay: `${li * 70}ms` }}>
                            <Link to={l.href}>{l.label} <ArrowRight /></Link>
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
            <div ref={endRef} />
          </div>
        </>
      )}

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] mt-4 bg-bg pb-1 pt-3 lg:bottom-0 lg:pb-4">
        {!online && <p className="mb-2 text-center text-[0.8125rem] text-muted"><span className="inline-flex items-center gap-1"><WifiOff className="size-4" /> The coach needs a connection.</span></p>}
        <form
          onSubmit={(e) => { e.preventDefault(); void send(draft); }}
          className="flex items-end gap-2 rounded-[1.5rem] border-2 border-line bg-card p-2 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)] transition-colors focus-within:border-hot"
        >
          <label htmlFor="coach-say" className="sr-only">Message the coach</label>
          <textarea
            id="coach-say"
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={1500}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(draft); } }}
            placeholder="Ask anything about your classes, or tell me what's coming up"
            className="min-h-11 flex-1 resize-none border-0 bg-transparent px-3 py-2.5 outline-none"
          />
          {busy ? (
            <button type="button" onClick={() => abort.current?.abort()} aria-label="Stop" className="grid size-11 flex-none place-items-center rounded-full bg-ink text-bg transition-transform active:scale-90">
              <Square className="size-4 fill-current" />
            </button>
          ) : (
            <button type="submit" disabled={!draft.trim() || !online} aria-label="Send" className="grid size-11 flex-none place-items-center rounded-full bg-primary text-white transition-transform active:scale-90 disabled:bg-line disabled:text-muted">
              <ArrowUp className="size-5" />
            </button>
          )}
        </form>
      </div>
    </section>
  );
}
