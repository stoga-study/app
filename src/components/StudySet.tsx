import { AlertCircle, BookMarked, BookOpen, Check, FileText, Layers, ListChecks, NotebookPen, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Markdown } from "@/components/Markdown";
import { MathText } from "@/components/MathText";
import { PageChips } from "@/components/PageChips";
import { ReportButton } from "@/components/ReportButton";
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
  // Only the parts this run makes.
  const order = ([["notes", "Writing notes"], ["cards", "Making flashcards"], ["quiz", "Building a practice quiz"], ["guide", "Writing the study guide"]] as const)
    .filter(([k]) => steps[k]);
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
      <p className="text-center text-[0.875rem] text-muted">It keeps going if you leave this screen.</p>
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

type Tab = "notes" | "cards" | "quiz" | "guide" | "summary" | "terms" | "pages";

function RegenerateGuide({ onRegenerate, busy }: { onRegenerate: (focus: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState("");
  if (!open) return <Button variant="ghost" size="sm" className="self-start" onClick={() => setOpen(true)}><Sparkles /> Regenerate with a focus</Button>;
  return (
    <form
      className="card flex flex-col gap-2 p-4"
      onSubmit={(e) => { e.preventDefault(); if (focus.trim()) onRegenerate(focus.trim()); }}
    >
      <label htmlFor="guide-focus" className="field-label">What should this guide focus on?</label>
      <input id="guide-focus" className="input" maxLength={120} placeholder="e.g. the midterm, shorter, Unit 4 only" value={focus} onChange={(e) => setFocus(e.target.value)} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !focus.trim()}>{busy ? "Remaking…" : "Remake the guide"}</Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
      </div>
      <p className="field-hint">Replaces the current guide for this file.</p>
    </form>
  );
}

/** The finished study set: what was made, then each part to read. */
export function SetView({ source, pagesSlot, onRegenerateGuide, regenerating }: { source: Source; pagesSlot: ReactNode; onRegenerateGuide?: (focus: string) => void; regenerating?: boolean }) {
  const set = useStudySet(source.id, true);
  // ?tab=guide (from the study plan) opens straight on that part.
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).get("tab") as Tab | null) ?? "notes");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (set.isPending) return <div className="skeleton mt-4 h-64 rounded-[1.5rem]" />;
  if (set.isError) return <p className="callout mt-4">We could not load the study set. Check your connection, then try again.</p>;
  const d = set.data;
  // Only the parts this file has, then its pages.
  const tabs = ([
    ["notes", "Notes", <NotebookPen key="n" />, d.notes.length],
    ["cards", "Cards", <Layers key="c" />, d.cards.length],
    ["quiz", d.quizzes.length > 1 ? "Quizzes" : "Quiz", <ListChecks key="q" />, d.questions.length],
    ["guide", "Guide", <BookOpen key="g" />, d.guide.length],
    ["summary", "Summary", <Sparkles key="s" />, d.summary ? 1 : 0],
    ["terms", "Key terms", <BookMarked key="t" />, d.terms.length],
    ["pages", pageWord(source.kind, 2).replace(/^./, (c) => c.toUpperCase()), <FileText key="p" />, source.page_count],
  ] as [Tab, string, ReactNode, number][]).filter(([key, , , n]) => key === "pages" || n > 0);
  const shown = tabs.some(([k]) => k === tab) ? tab : tabs[0][0];
  const minutes = d.guide.reduce((n, g) => n + (g.minutes ?? 0), 0);

  return (
    <section className="mt-4" aria-label="Study set">
      <ul className="card divide-y divide-line px-4">
        {([
          [<NotebookPen key="n" />, d.notes.length, "note sections"],
          [<Layers key="c" />, d.cards.length, "flashcards"],
          [<ListChecks key="q" />, d.questions.length, d.quizzes.length > 1 ? `quiz questions in ${d.quizzes.length} quizzes` : "quiz questions"],
          [<BookOpen key="g" />, d.guide.length, `study guide sections${minutes ? `, about ${minutes} minutes` : ""}`],
          [<BookMarked key="t" />, d.terms.length, "key terms"],
        ] as [ReactNode, number, string][]).filter(([, n]) => n > 0).map(([icon, n, label], i) => (
          <li key={i} className="flex items-center gap-3 py-3 [&>svg]:hidden">
            {icon}
            <span><b className="tabular">{n as number}</b> {label as string}</span>
          </li>
        ))}
      </ul>
      {(source.steps as Steps | null)?.shared && (
        <p className="callout mt-3"><Sparkles /> <span>This file was already prepared on Stoga.study, so your study set was ready instantly. It did not count toward your study sets.</span></p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {d.cards.length > 0 && <Button asChild variant="secondary" size="sm"><Link to="/review"><Layers /> Review cards</Link></Button>}
        {d.quiz && <Button asChild variant="secondary" size="sm"><Link to={`/quiz/${d.quiz.id}`}><ListChecks /> Take the quiz</Link></Button>}
      </div>

      <div role="tablist" aria-label="Study set parts" className="-mx-5 mt-6 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {tabs.map(([key, label, icon, n]) => (
          <button key={key} type="button" role="tab" aria-selected={shown === key} aria-controls={`panel-${key}`} id={`tab-${key}`} onClick={() => setTab(key)} className="pill-option flex-none">
            {icon}
            {label}
            <span className="tabular font-normal text-muted">{n}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${shown}`} aria-labelledby={`tab-${shown}`} className="mt-4 flex flex-col gap-3">
        {shown === "notes" && d.notes.map((n) => (
          <article key={n.id} className="card p-5">
            <h3 className="text-[1.25rem]">{n.title}</h3>
            <Markdown text={n.body_md} className="text-ink-2" />
            <PageChips pages={n.pages} kind={source.kind} sourceId={source.id} />
            <ReportButton itemType="notes_section" itemId={n.id} subjectId={source.subject_id} className="mt-2 -ml-3" />
          </article>
        ))}

        {shown === "cards" && d.cards.map((c) => (
          <div key={c.id} className={`card w-full p-5 ${open[c.id] ? "!border-tint-line !bg-tint" : ""}`}>
            <button type="button" onClick={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))} aria-expanded={!!open[c.id]} className="w-full text-left">
              <span className="chip !text-[0.8125rem]">{open[c.id] ? "Answer" : "Question"}</span>
              <span className="mt-2 block font-display text-[1.125rem] font-bold">{open[c.id] ? <MathText text={c.back} /> : <MathText text={c.front} />}</span>
            </button>
            {/* The quote would give the answer away before the card is open, so it only shows after. */}
            <PageChips pages={c.pages} kind={source.kind} quote={open[c.id] ? c.quote : null} sourceId={source.id} />
            {open[c.id] && <ReportButton itemType="card" itemId={c.id} subjectId={source.subject_id} className="mt-2 -ml-3" />}
          </div>
        ))}

        {shown === "quiz" && d.quizzes.map((quiz) => (
          <section key={quiz.id} className="flex flex-col gap-3" aria-label={quiz.title}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[1.25rem]">{quiz.title}</h3>
              <Button asChild variant="secondary" size="sm"><Link to={`/quiz/${quiz.id}`}><ListChecks /> Take this quiz</Link></Button>
            </div>
            {quiz.questions.map((q, i) => (
              <article key={q.id} className="card p-5">
                <p className="text-[0.8125rem] font-bold text-muted">Question {i + 1}</p>
                <p className="mt-1 font-display text-[1.125rem] font-bold"><MathText text={q.prompt} /></p>
                <ol className="mt-3 flex flex-col gap-2">
                  {q.options.map((o, k) => {
                    const reveal = open[q.id] && k === q.answer_index;
                    return (
                      <li key={k} className={`flex items-center gap-3 rounded-[0.875rem] border-2 px-3 py-2 ${reveal ? "border-primary bg-tint" : "border-line"}`}>
                        <span className="grid size-7 flex-none place-items-center rounded-full bg-soft text-[0.8125rem] font-bold">{"ABCD"[k]}</span>
                        <span className="flex-1"><MathText text={o} /></span>
                        {reveal && <Check className="size-5 text-brand" aria-label="Correct answer" />}
                      </li>
                    );
                  })}
                </ol>
                {open[q.id] ? (
                  <div className="callout mt-3"><span><b>Why:</b> <MathText text={q.explanation} /></span></div>
                ) : (
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => setOpen((o) => ({ ...o, [q.id]: true }))}>Show answer</Button>
                )}
                <PageChips pages={q.pages} kind={source.kind} quote={open[q.id] ? q.quote : null} sourceId={source.id} />
                {open[q.id] && <ReportButton itemType="quiz_question" itemId={q.id} subjectId={source.subject_id} className="mt-2 -ml-3" />}
              </article>
            ))}
          </section>
        ))}

        {shown === "guide" && (
          <>
            {d.guide.map((g, i) => (
              <article key={g.id} className="card p-5">
                <p className="text-[0.8125rem] font-bold text-muted">Section {i + 1} of {d.guide.length}{g.minutes ? `, about ${g.minutes} minutes` : ""}</p>
                <h3 className="mt-1 text-[1.25rem]">{g.title}</h3>
                <Markdown text={g.body_md} className="text-ink-2" />
                <PageChips pages={g.pages} kind={source.kind} sourceId={source.id} />
                <ReportButton itemType="guide_section" itemId={g.id} subjectId={source.subject_id} className="mt-2 -ml-3" />
              </article>
            ))}
            {onRegenerateGuide && <RegenerateGuide onRegenerate={onRegenerateGuide} busy={!!regenerating} />}
          </>
        )}

        {shown === "summary" && d.summary && (
          <article className="card p-5">
            <Markdown text={d.summary.body_md} className="text-ink-2" />
          </article>
        )}

        {shown === "terms" && d.terms.map((t) => (
          <article key={t.id} className="card p-5">
            <h3 className="font-display text-[1.125rem] font-bold">{t.term}</h3>
            <p className="mt-1 text-ink-2">{t.definition}</p>
            <PageChips pages={t.pages} kind={source.kind} sourceId={source.id} />
          </article>
        ))}

        {shown === "pages" && pagesSlot}
      </div>
    </section>
  );
}
