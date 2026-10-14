import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Clock, RotateCcw, Timer, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { MathText } from "@/components/MathText";
import { PageHeader } from "@/components/PageHeader";
import { PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { clock, LENGTHS, minutesFor, pickTest, scoreTest, type SaVerdict, type TestItem } from "@/lib/practiceTest";
import { useGrading } from "@/lib/preferences";
import { useEvents } from "@/lib/queries/events";
import { gradeAnswer } from "@/lib/queries/grade";
import { finishTest, usePracticePool, type PoolCard, type PoolQuestion, type TestResult } from "@/lib/queries/practiceTest";
import { useSubjects } from "@/lib/queries/profile";
import { useUnits } from "@/lib/queries/units";
import { unitName } from "@/lib/units";

type Phase =
  | { step: "setup" }
  | { step: "running"; items: TestItem[]; endsAt: number; startedAt: number }
  | { step: "grading"; items: TestItem[]; seconds: number }
  | { step: "results"; items: TestItem[]; results: TestResult[]; seconds: number };
type Answer = { chosen: number | null; text: string };

/**
 * A timed practice test (/practice-test?subject=&units=&event=): multiple choice and written answers
 * from a class or some of its units, weighted to weak spots, no hints. Afterwards a score and a full
 * review; misses go to mistake review and back into card review.
 */
export default function PracticeTest() {
  const [params] = useSearchParams();
  const subjects = useSubjects();
  const events = useEvents();
  const event = events.data?.find((e) => e.id === params.get("event"));
  const [subjectId, setSubjectId] = useState<string | null>(params.get("subject"));
  const [unitIds, setUnitIds] = useState<string[]>(() => (params.get("units") ?? "").split(",").filter(Boolean));
  const [length, setLength] = useState<number>(20);
  const [phase, setPhase] = useState<Phase>({ step: "setup" });
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [at, setAt] = useState(0);
  const pool = usePracticePool(subjectId, unitIds);
  const units = useUnits(subjectId ?? undefined);
  const subject = subjects.data?.find((s) => s.id === subjectId);

  const qById = useMemo(() => new Map((pool.data?.questions ?? []).map((q) => [q.id, q])), [pool.data]);
  const cById = useMemo(() => new Map((pool.data?.cards ?? []).map((c) => [c.id, c])), [pool.data]);

  if (subjects.isPending) return <PageSkeleton label="Getting your test ready." />;

  const start = () => {
    if (!pool.data) return;
    const items = pickTest({
      mc: pool.data.questions.map((q) => ({ id: q.id, topic: q.topic, missed: q.missed })),
      cards: pool.data.cards,
      n: length,
      ap: subject?.level === "AP",
      weakTopics: pool.data.weakTopics,
    });
    const now = Date.now();
    setAnswers({});
    setAt(0);
    setPhase({ step: "running", items, startedAt: now, endsAt: now + minutesFor(items) * 60_000 });
  };

  if (phase.step === "running") {
    return (
      <Running
        items={phase.items}
        endsAt={phase.endsAt}
        at={at}
        setAt={setAt}
        answers={answers}
        setAnswers={setAnswers}
        q={qById}
        c={cById}
        onHandIn={() => setPhase({ step: "grading", items: phase.items, seconds: Math.round((Math.min(Date.now(), phase.endsAt) - phase.startedAt) / 1000) })}
      />
    );
  }
  if (phase.step === "grading") {
    return (
      <Grading
        items={phase.items}
        answers={answers}
        q={qById}
        c={cById}
        onDone={(results) => setPhase({ step: "results", items: phase.items, results, seconds: phase.seconds })}
      />
    );
  }
  if (phase.step === "results") {
    return <Results subjectId={subjectId!} eventId={event?.id ?? null} unitIds={unitIds} results={phase.results} seconds={phase.seconds} q={qById} c={cById} onAgain={() => setPhase({ step: "setup" })} />;
  }

  // ----- Setup -----
  const mcCount = pool.data?.questions.length ?? 0;
  const saCount = pool.data?.cards.length ?? 0;
  const available = mcCount + saCount;
  const preview = pool.data
    ? pickTest({ mc: pool.data.questions.map((q) => ({ id: q.id, topic: q.topic, missed: q.missed })), cards: pool.data.cards, n: length, ap: subject?.level === "AP", weakTopics: [], rand: () => 0.5 })
    : [];
  return (
    <section className="mx-auto max-w-2xl" aria-label="Practice test">
      <Link to={event ? "/calendar" : subjectId ? `/subjects/${subjectId}` : "/review"} className="mb-4 inline-flex min-h-11 items-center gap-2 font-bold text-ink-2 no-underline">
        <ArrowLeft className="size-5" /> Back
      </Link>
      <PageHeader eyebrow={event ? `For ${event.title}` : undefined} title="Practice test">
        Timed, no hints, like the real thing. Questions you got wrong before and your weak cards come up more.
      </PageHeader>
      <div className="card flex flex-col gap-5 p-5">
        <div>
          <label htmlFor="pt-class" className="mb-1 block font-bold">Class</label>
          <select id="pt-class" className="input w-full" value={subjectId ?? ""} onChange={(e) => { setSubjectId(e.target.value || null); setUnitIds([]); }}>
            <option value="">Choose a class</option>
            {subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {subjectId && (units.data?.length ?? 0) > 0 && (
          <fieldset>
            <legend className="mb-1 font-bold">Units <span className="font-normal text-muted">(none picked means the whole class)</span></legend>
            <div className="flex flex-wrap gap-2">
              {units.data!.map((u) => {
                const on = unitIds.includes(u.id);
                return (
                  <button key={u.id} type="button" aria-pressed={on} className="pill-option" onClick={() => setUnitIds((x) => (on ? x.filter((y) => y !== u.id) : [...x, u.id]))}>
                    {on && <Check />}{unitName(u)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
        <fieldset>
          <legend className="mb-1 font-bold">Questions</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Number of questions">
            {LENGTHS.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={length === n} className="pill-option" onClick={() => setLength(n)}>{n}</button>
            ))}
          </div>
        </fieldset>
        {subjectId && (pool.isPending ? (
          <div className="skeleton h-12 rounded-xl" />
        ) : available < 3 ? (
          <p className="callout neutral"><span>There isn't enough here for a test yet. Make flashcards or a quiz from a file in {unitIds.length ? "these units" : "this class"} first.</span></p>
        ) : (
          <p className="flex items-center gap-2 text-[0.9375rem] text-muted">
            <Timer className="size-5 text-brand" aria-hidden="true" />
            {preview.length} questions: {preview.filter((i) => i.kind === "mc").length} multiple choice, {preview.filter((i) => i.kind === "sa").length} written{subject?.level === "AP" ? " (AP-style mix)" : ""}. {minutesFor(preview)} minutes.
          </p>
        ))}
        <Button disabled={!subjectId || !pool.data || available < 3} onClick={start} className="self-start">Start the test</Button>
      </div>
    </section>
  );
}

function Running({ items, endsAt, at, setAt, answers, setAnswers, q, c, onHandIn }: {
  items: TestItem[];
  endsAt: number;
  at: number;
  setAt: (n: number) => void;
  answers: Record<string, Answer>;
  setAnswers: (fn: (a: Record<string, Answer>) => Record<string, Answer>) => void;
  q: Map<string, PoolQuestion>;
  c: Map<string, PoolCard>;
  onHandIn: () => void;
}) {
  const [left, setLeft] = useState(() => Math.round((endsAt - Date.now()) / 1000));
  const [confirm, setConfirm] = useState(false);
  const handedIn = useRef(false);
  useEffect(() => {
    const t = setInterval(() => {
      const s = Math.round((endsAt - Date.now()) / 1000);
      setLeft(s);
      // Time's up: hand in what there is.
      if (s <= 0 && !handedIn.current) {
        handedIn.current = true;
        toast("Time's up. Your test was handed in.");
        onHandIn();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [endsAt, onHandIn]);
  // Leaving mid-test asks first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const item = items[at];
  const a = answers[item.id] ?? { chosen: null, text: "" };
  const set = (patch: Partial<Answer>) => setAnswers((x) => ({ ...x, [item.id]: { ...a, ...patch } }));
  const answered = (i: TestItem) => (i.kind === "mc" ? answers[i.id]?.chosen != null : !!answers[i.id]?.text.trim());
  const unanswered = items.filter((i) => !answered(i)).length;

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4" aria-label="Practice test">
      <div className="sticky top-0 z-10 -mx-5 flex items-center gap-3 bg-bg px-5 py-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-bold tabular", left <= 60 ? "bg-hot text-white" : "bg-tint text-brand")} role="timer" aria-label={`${clock(left)} left`}>
          <Clock className="size-4" aria-hidden="true" /> {clock(left)}
        </span>
        <div className="segments flex-1" role="img" aria-label={`Question ${at + 1} of ${items.length}`}>
          {items.map((i, k) => <span key={i.id} style={k === at ? { background: "var(--hot)" } : answered(i) ? { background: "var(--primary)" } : undefined} />)}
        </div>
      </div>
      <p className="text-[0.9375rem] font-bold text-muted">Question {at + 1} of {items.length} · {item.kind === "mc" ? "Multiple choice" : "Written answer"}</p>
      {item.kind === "mc" ? (
        <>
          <h2 id={`q-${item.id}`} className="text-[1.25rem]"><MathText text={q.get(item.id)?.prompt ?? ""} /></h2>
          <div role="radiogroup" aria-labelledby={`q-${item.id}`} className="flex flex-col gap-2">
            {(q.get(item.id)?.options ?? []).map((o, k) => (
              <button key={k} type="button" role="radio" aria-checked={a.chosen === k} onClick={() => set({ chosen: k })} className={cn("card flex items-start gap-3 p-4 text-left !shadow-none", a.chosen === k && "!border-primary bg-tint")}>
                <span className="grid size-7 flex-none place-items-center rounded-full border-2 border-line font-bold">{"ABCD"[k]}</span>
                <span className="pt-0.5"><MathText text={o} /></span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <h2 className="text-[1.25rem]"><label htmlFor={`a-${item.id}`}><MathText text={c.get(item.id)?.front ?? ""} /></label></h2>
          <textarea id={`a-${item.id}`} className="input w-full !min-h-32" maxLength={1500} placeholder="Your answer, in your own words" value={a.text} onChange={(e) => set({ text: e.target.value })} />
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={at === 0} onClick={() => setAt(at - 1)}><ArrowLeft /> Back</Button>
        {at < items.length - 1 ? (
          <Button className="flex-1" onClick={() => setAt(at + 1)}>Next <ArrowRight /></Button>
        ) : (
          <Button className="flex-1" onClick={() => (unanswered ? setConfirm(true) : onHandIn())}>Hand in</Button>
        )}
      </div>
      {at < items.length - 1 && <Button variant="ghost" className="self-start" onClick={() => (unanswered ? setConfirm(true) : onHandIn())}>Hand in now</Button>}
      {confirm && (
        <div role="alert" className="card flex flex-wrap items-center gap-3 p-4">
          <p className="flex-1">{unanswered} {unanswered === 1 ? "question has" : "questions have"} no answer yet. Hand in anyway?</p>
          <Button size="sm" variant="secondary" onClick={() => { setConfirm(false); setAt(items.findIndex((i) => !answered(i))); }}>Go to it</Button>
          <Button size="sm" onClick={() => { handedIn.current = true; onHandIn(); }}>Hand in</Button>
        </div>
      )}
    </section>
  );
}

/** Written answers are checked by the AI (three at a time), or by the student, before the score. */
function Grading({ items, answers, q, c, onDone }: { items: TestItem[]; answers: Record<string, Answer>; q: Map<string, PoolQuestion>; c: Map<string, PoolCard>; onDone: (r: TestResult[]) => void }) {
  const [mode] = useGrading();
  const written = items.filter((i) => i.kind === "sa" && answers[i.id]?.text.trim());
  const [verdicts, setVerdicts] = useState<Record<string, { verdict: SaVerdict; feedback: string | null }>>({});
  const [needSelf, setNeedSelf] = useState<string[] | null>(mode === "self" ? written.map((i) => i.id) : null);
  const started = useRef(false);

  const finish = (v: Record<string, { verdict: SaVerdict; feedback: string | null }>) =>
    onDone(items.map((i): TestResult => {
      const a = answers[i.id];
      if (i.kind === "mc") {
        const chosen = a?.chosen ?? null;
        return { kind: "mc", id: i.id, chosen, correct: chosen !== null && chosen === q.get(i.id)?.answer_index };
      }
      return { kind: "sa", id: i.id, answer: a?.text.trim() ?? "", verdict: a?.text.trim() ? v[i.id]?.verdict ?? null : "not_yet", feedback: v[i.id]?.feedback ?? null };
    }));

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (mode === "self") {
      // Nothing written to mark: straight to the score.
      if (!written.length) finish({});
      return;
    }
    void (async () => {
      const out: Record<string, { verdict: SaVerdict; feedback: string | null }> = {};
      const failed: string[] = [];
      for (let k = 0; k < written.length; k += 3) {
        await Promise.all(written.slice(k, k + 3).map(async (i) => {
          try {
            const g = await gradeAnswer(i.id, answers[i.id].text.trim());
            out[i.id] = { verdict: g.verdict, feedback: g.feedback };
          } catch {
            failed.push(i.id);
          }
        }));
        setVerdicts({ ...out });
      }
      if (failed.length) {
        toast("Some answers couldn't be checked automatically. Mark those yourself.");
        setVerdicts({ ...out });
        setNeedSelf(failed);
      } else finish(out);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!needSelf) {
    return (
      <section className="mx-auto flex max-w-xl flex-col items-center gap-3 py-16 text-center" aria-live="polite">
        <div className="skeleton size-14 rounded-full" />
        <h1 className="text-[1.75rem]">Checking your answers</h1>
        <p className="text-muted">{Object.keys(verdicts).length} of {written.length} written answers checked.</p>
      </section>
    );
  }
  const pending = needSelf.filter((id) => !verdicts[id]);
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4" aria-label="Mark your answers">
      <PageHeader title="Mark your written answers">Compare each with the answer from your cards, honestly. It only helps you.</PageHeader>
      {needSelf.map((id) => (
        <div key={id} className="card flex flex-col gap-2 p-5">
          <p className="font-bold"><MathText text={c.get(id)?.front ?? ""} /></p>
          <p className="text-[0.9375rem]"><span className="font-bold text-muted">You wrote: </span>{answers[id]?.text}</p>
          <p className="text-[0.9375rem]"><span className="font-bold text-muted">Answer: </span><MathText text={c.get(id)?.back ?? ""} /></p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How did you do?">
            {(["right", "partly", "not_yet"] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={verdicts[id]?.verdict === v} className="pill-option" onClick={() => setVerdicts((x) => ({ ...x, [id]: { verdict: v, feedback: null } }))}>
                {v === "right" ? "Got it" : v === "partly" ? "Partly" : "Missed it"}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Button disabled={pending.length > 0} onClick={() => finish(verdicts)}>See my score</Button>
    </section>
  );
}

function Results({ subjectId, eventId, unitIds, results, seconds, q, c, onAgain }: {
  subjectId: string; eventId: string | null; unitIds: string[]; results: TestResult[]; seconds: number;
  q: Map<string, PoolQuestion>; c: Map<string, PoolCard>; onAgain: () => void;
}) {
  const score = scoreTest(results);
  const saved = useRef(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => {
    if (saved.current) return;
    saved.current = true;
    finishTest({ subjectId, eventId, unitIds, results, points: score.points, pct: score.pct, seconds })
      .then(() => ["mistakes", "practice-tests", "due-cards", "plan-cards", "mastery-cards"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })))
      .catch(() => toast("We couldn't save this test. Your score is below."));
  }, [subjectId, eventId, unitIds, results, score.points, score.pct, seconds, qc]);
  const missedMc = results.filter((r) => r.kind === "mc" && !r.correct).length;
  const missedSa = results.filter((r) => r.kind === "sa" && r.verdict !== "right").length;

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4" aria-label="Your results">
      <div className="ink-panel burgundy p-6">
        <span className="circle circle-big right-[-4rem] top-[-5rem] size-52" aria-hidden="true" />
        <p className="text-[0.9375rem] text-[#F7EAEC]">Practice test score</p>
        <p className="big-num mt-1 text-[5rem]">{score.pct}%</p>
        <p className="text-[#F7EAEC]">{score.points % 1 ? score.points.toFixed(1) : score.points} of {score.total} · {clock(seconds)} taken</p>
        {(missedMc > 0 || missedSa > 0) && (
          <p className="mt-3 text-[0.9375rem] text-[#F7EAEC]">
            {[missedMc ? `${missedMc} choice question${missedMc === 1 ? "" : "s"} went to mistake review` : null, missedSa ? `${missedSa} card${missedSa === 1 ? "" : "s"} come back in your next review` : null].filter(Boolean).join(", and ")}.
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {missedMc > 0 && <Button asChild><Link to="/mistakes"><RotateCcw /> Review mistakes</Link></Button>}
        <Button variant="secondary" onClick={onAgain}>Take another</Button>
        <Button variant="ghost" onClick={() => navigate(eventId ? "/calendar" : `/subjects/${subjectId}`)}>Done</Button>
      </div>
      <h2 className="mt-2 text-[1.375rem]">Every question</h2>
      <ol className="flex flex-col gap-3">
        {results.map((r, k) => {
          const ok = r.kind === "mc" ? r.correct : r.verdict === "right";
          const partly = r.kind === "sa" && r.verdict === "partly";
          return (
            <li key={r.id} className="card flex gap-3 p-4">
              <span className={cn("grid size-8 flex-none place-items-center rounded-full", ok ? "bg-primary text-white" : partly ? "bg-tint text-brand" : "border-2 border-hot text-hot")} aria-label={ok ? "Right" : partly ? "Partly right" : "Not right"}>
                {ok ? <Check className="size-4" /> : partly ? "½" : <X className="size-4" />}
              </span>
              <div className="min-w-0 flex-1 text-[0.9375rem]">
                <p className="font-bold">{k + 1}. <MathText text={r.kind === "mc" ? q.get(r.id)?.prompt ?? "" : c.get(r.id)?.front ?? ""} /></p>
                {r.kind === "mc" ? (
                  <>
                    <p className="mt-1"><span className="text-muted">You chose: </span>{r.chosen === null ? "No answer" : <MathText text={q.get(r.id)?.options[r.chosen] ?? ""} />}</p>
                    {!r.correct && <p><span className="text-muted">Answer: </span><MathText text={q.get(r.id)?.options[q.get(r.id)?.answer_index ?? 0] ?? ""} /></p>}
                    {!r.correct && q.get(r.id)?.explanation && <p className="mt-1 text-muted"><MathText text={q.get(r.id)!.explanation} /></p>}
                  </>
                ) : (
                  <>
                    <p className="mt-1"><span className="text-muted">You wrote: </span>{r.answer || "No answer"}</p>
                    {!ok && <p><span className="text-muted">Answer: </span><MathText text={c.get(r.id)?.back ?? ""} /></p>}
                    {r.feedback && <p className="mt-1 text-muted">{r.feedback}</p>}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
