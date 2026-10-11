import { AlertCircle, BookOpen, Check, FileText, Layers, ListChecks, NotebookPen, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Markdown } from "@/components/Markdown";
import { PageChips } from "@/components/PageChips";
import { Button } from "@/components/ui/button";
import { pageWord, type Source } from "@/lib/queries/sources";
import { progressOf, useStudySet, type Steps } from "@/lib/queries/studyset";

const SECONDS_PER_JOB = 4;

function StepRow({ state, label, end }: { state: "done" | "working" | "waiting"; label: string; end: ReactNode }) {
  return (
    <li className={`flex items-center gap-3 py-3 ${state === "waiting" ? "text-muted" : ""} ${state === "working" ? "font-bold" : ""}`}>
      <span
        aria-hidden="true"
        className={`grid size-6 flex-none place-items-center rounded-full border-2 ${state === "done" ? "border-primary bg-primary text-white" : state === "working" ? "animate-[spin_800ms_linear_infinite] border-tint-line border-t-hot" : "border-line-strong"}`}
      >
        {state === "done" && <Check className="size-3.5" />}
      </span>
      {label}
      <span className="ml-auto text-[0.875rem] font-normal text-muted tabular">{end}</span>
    </li>
  );
}

/** "Preparing your study set": live progress while the server works through its jobs. */
export function Processing({ source }: { source: Source }) {
  const steps = (source.steps ?? {}) as Steps;
  const { pct, remainingJobs } = progressOf(steps);
  const order: [keyof Steps, string][] = [["notes", "Writing notes"], ["cards", "Making flashcards"], ["quiz", "Building a practice quiz"], ["guide", "Writing the study guide"]];
  const firstOpen = order.findIndex(([k]) => {
    const p = steps[k] as { done: number; total: number } | undefined;
    return !p || p.done < p.total;
  });
  const secs = remainingJobs * SECONDS_PER_JOB;
  return (
    <section className="mt-4 flex flex-col gap-4" aria-labelledby="prep-title" aria-busy="true">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="prep-title" className="text-[1.375rem]">Preparing your study set</h2>
          <p className="text-[0.9375rem] text-muted">{secs <= 10 ? "Almost done" : secs < 60 ? "Less than a minute left" : `About ${Math.round(secs / 60)} minutes left`}</p>
        </div>
        <span className="big-num text-[2.75rem] tabular">{pct}%</span>
      </div>
      <div className="bar !h-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Study set progress">
        <span style={{ width: `${pct}%` }} />
      </div>
      <ul className="card divide-y divide-line px-4">
        <StepRow state="done" label={`Reading ${pageWord(source.kind, 2)}`} end={`${source.page_count} ${pageWord(source.kind, source.page_count)}`} />
        {order.map(([k, label], i) => {
          const p = steps[k] as { done: number; total: number } | undefined;
          const state = i < firstOpen || firstOpen === -1 ? "done" : i === firstOpen ? "working" : "waiting";
          const end = state === "done" ? "Done" : state === "working" ? (p && p.total > 1 ? `${p.done} of ${p.total}` : "Working") : "Waiting";
          return <StepRow key={k} state={state} label={label} end={end} />;
        })}
      </ul>
      <p className="text-center text-[0.875rem] text-muted">It keeps going if you leave this screen. Your uploads allowance was already counted; this costs nothing extra.</p>
    </section>
  );
}

const FAILURE: Record<string, { title: string; body: string }> = {
  rate_limited: { title: "Stoga.study is busy right now", body: "Too many study sets are being made at once. Try again in a minute." },
  key_invalid: { title: "Your own key did not work", body: "Your AI provider turned down the key. Update it in Settings, then try again." },
  generation_failed: { title: "We could not finish your study set", body: "Something went wrong partway through. Try again to pick up where it stopped." },
};

export function Failed({ source, onRetry, retrying }: { source: Source; onRetry: () => void; retrying: boolean }) {
  const f = FAILURE[source.error_code ?? ""] ?? FAILURE.generation_failed;
  return (
    <section role="alert" className="card mt-4 flex flex-col items-start gap-3 p-5">
      <span className="tile t4"><AlertCircle /></span>
      <h2 className="text-[1.375rem]">{f.title}</h2>
      <p className="text-ink-2">{f.body} Anything already made is kept.</p>
      <Button onClick={onRetry} disabled={retrying}>{retrying ? "Starting…" : "Try again"}</Button>
    </section>
  );
}

export function NotStarted({ onStart, starting }: { onStart: () => void; starting: boolean }) {
  return (
    <div className="card card-dashed mt-4 flex flex-col items-start gap-3 p-5">
      <span className="tile soft"><Sparkles /></span>
      <div>
        <p className="font-bold">Make a study set from this file</p>
        <p className="text-[0.9375rem] text-muted">Notes, flashcards, a practice quiz and a study guide, each linked to its pages. Takes about a minute.</p>
      </div>
      <Button onClick={onStart} disabled={starting}><Sparkles /> {starting ? "Starting…" : "Make study set"}</Button>
    </div>
  );
}

type Tab = "notes" | "cards" | "quiz" | "guide" | "pages";

/** The finished study set: what was made, then each part to read. */
export function SetView({ source, pagesSlot }: { source: Source; pagesSlot: ReactNode }) {
  const set = useStudySet(source.id, true);
  const [tab, setTab] = useState<Tab>("notes");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (set.isPending) return <div className="skeleton mt-4 h-64 rounded-[1.5rem]" />;
  if (set.isError) return <p className="callout mt-4">We could not load the study set. Check your connection, then try again.</p>;
  const d = set.data;
  const tabs: [Tab, string, ReactNode, number][] = [
    ["notes", "Notes", <NotebookPen key="n" />, d.notes.length],
    ["cards", "Cards", <Layers key="c" />, d.cards.length],
    ["quiz", "Quiz", <ListChecks key="q" />, d.questions.length],
    ["guide", "Guide", <BookOpen key="g" />, d.guide.length],
    ["pages", pageWord(source.kind, 2).replace(/^./, (c) => c.toUpperCase()), <FileText key="p" />, source.page_count],
  ];
  const minutes = d.guide.reduce((n, g) => n + (g.minutes ?? 0), 0);

  return (
    <section className="mt-4" aria-label="Study set">
      <ul className="card divide-y divide-line px-4">
        {[
          [<NotebookPen key="n" />, d.notes.length, "note sections"],
          [<Layers key="c" />, d.cards.length, "flashcards"],
          [<ListChecks key="q" />, d.questions.length, "quiz questions"],
          [<BookOpen key="g" />, d.guide.length, `study guide sections${minutes ? `, about ${minutes} minutes` : ""}`],
        ].map(([icon, n, label], i) => (
          <li key={i} className="flex items-center gap-3 py-3 [&_svg]:size-5 [&_svg]:text-brand">
            {icon}
            <span><b className="tabular">{n as number}</b> {label as string}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[0.875rem] text-muted">Card review and quiz practice arrive in the next update. You can read everything now.</p>

      <div role="tablist" aria-label="Study set parts" className="-mx-5 mt-6 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {tabs.map(([key, label, icon, n]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} aria-controls={`panel-${key}`} id={`tab-${key}`} onClick={() => setTab(key)} className="pill-option flex-none" aria-pressed={tab === key}>
            {icon}
            {label}
            <span className="tabular font-normal text-muted">{n}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-4 flex flex-col gap-3">
        {tab === "notes" && d.notes.map((n) => (
          <article key={n.id} className="card p-5">
            <h3 className="text-[1.25rem]">{n.title}</h3>
            <Markdown text={n.body_md} className="text-ink-2" />
            <PageChips pages={n.pages} kind={source.kind} />
          </article>
        ))}

        {tab === "cards" && d.cards.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))}
            aria-expanded={!!open[c.id]}
            className={`card w-full p-5 text-left ${open[c.id] ? "!border-tint-line !bg-tint" : ""}`}
          >
            <span className="chip !text-[0.8125rem]">{open[c.id] ? "Answer" : "Question"}</span>
            <span className="mt-2 block font-display text-[1.125rem] font-bold">{open[c.id] ? c.back : c.front}</span>
            <PageChips pages={c.pages} kind={source.kind} />
          </button>
        ))}

        {tab === "quiz" && (
          <>
            {d.quiz && <h3 className="text-[1.25rem]">{d.quiz.title}</h3>}
            {d.questions.map((q, i) => (
              <article key={q.id} className="card p-5">
                <p className="text-[0.8125rem] font-bold text-muted">Question {i + 1}</p>
                <p className="mt-1 font-display text-[1.125rem] font-bold">{q.prompt}</p>
                <ol className="mt-3 flex flex-col gap-2">
                  {q.options.map((o, k) => {
                    const reveal = open[q.id] && k === q.answer_index;
                    return (
                      <li key={k} className={`flex items-center gap-3 rounded-[0.875rem] border-2 px-3 py-2 ${reveal ? "border-primary bg-tint" : "border-line"}`}>
                        <span className="grid size-7 flex-none place-items-center rounded-full bg-soft text-[0.8125rem] font-bold">{"ABCD"[k]}</span>
                        <span className="flex-1">{o}</span>
                        {reveal && <Check className="size-5 text-brand" aria-label="Correct answer" />}
                      </li>
                    );
                  })}
                </ol>
                {open[q.id] ? (
                  <div className="callout mt-3"><span><b>Why:</b> {q.explanation}</span></div>
                ) : (
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => setOpen((o) => ({ ...o, [q.id]: true }))}>Show answer</Button>
                )}
                <PageChips pages={q.pages} kind={source.kind} />
              </article>
            ))}
          </>
        )}

        {tab === "guide" && d.guide.map((g, i) => (
          <article key={g.id} className="card p-5">
            <p className="text-[0.8125rem] font-bold text-muted">Section {i + 1} of {d.guide.length}{g.minutes ? `, about ${g.minutes} minutes` : ""}</p>
            <h3 className="mt-1 text-[1.25rem]">{g.title}</h3>
            <Markdown text={g.body_md} className="text-ink-2" />
            <PageChips pages={g.pages} kind={source.kind} />
          </article>
        ))}

        {tab === "pages" && pagesSlot}
      </div>
    </section>
  );
}
