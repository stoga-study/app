import { useQueryClient } from "@tanstack/react-query";
import { Check, Info, Lightbulb, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { MathText } from "@/components/MathText";
import { PageChips } from "@/components/PageChips";
import { ReportButton } from "@/components/ReportButton";
import { ErrorState, PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import type { Json } from "@/lib/database.types";
import { topicBreakdown } from "@/lib/mastery";
import { loadAttempt, recordAnswer, startAttempt, useMistakes, useQuiz, useUnitQuestions, type Question } from "@/lib/queries/quiz";
import { useSources } from "@/lib/queries/sources";
import { useAllUnits } from "@/lib/queries/units";
import { unitName } from "@/lib/units";

type Item = Question & { kind: string };

/** Practice quiz (/quiz/:id), mistake practice (/quiz/mistakes?topic=) or a unit's mix (/quiz/unit?unit=). */
export default function Quiz() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const unitMode = id === "unit";
  const mistakesMode = id === "mistakes";
  const unitId = params.get("unit") ?? undefined;
  const topic = params.get("topic");
  const quiz = useQuiz(mistakesMode || unitMode ? undefined : id);
  const unitQs = useUnitQuestions(unitMode ? unitId : undefined);
  const units = useAllUnits();
  const unit = units.data?.find((u) => u.id === unitId);
  const sources = useSources();
  const mistakes = useMistakes();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const items: Item[] | null = useMemo(() => {
    if (unitMode) return unitQs.data ?? null;
    if (mistakesMode) {
      if (!mistakes.data) return null;
      return mistakes.data.filter((m) => !topic || (m.question.topic ?? "Other") === topic).map((m) => m.question);
    }
    if (!quiz.data) return null;
    return quiz.data.questions.map((q) => ({ ...q, kind: quiz.data!.kind }));
    // Freeze the list for the session: answering changes the mistakes query underneath.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitMode ? !!unitQs.data : mistakesMode ? !!mistakes.data : quiz.data, topic]);

  const [i, setI] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [hint, setHint] = useState(false);
  const [answers, setAnswers] = useState<{ q: string; chosen: number; correct: boolean }[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);

  // ?attempt= picks up a quiz left part-way ("Continue studying"); otherwise a new try starts.
  const resume = params.get("attempt");
  useEffect(() => {
    if (mistakesMode || unitMode || !quiz.data || !items?.length || attemptId !== null) return;
    const quizId = quiz.data.quiz.id;
    const fresh = () => startAttempt(quizId, items.length).then(setAttemptId).catch(() => setAttemptId(""));
    if (!resume) return void fresh();
    loadAttempt(resume)
      .then((a) => {
        const done = Array.isArray(a?.answers) ? (a.answers as unknown as { q: string; chosen: number; correct: boolean }[]) : [];
        if (!a || a.quiz_id !== quizId || a.finished_at || !done.length || done.length >= items.length) return fresh();
        setAnswers(done);
        setI(done.length);
        setAttemptId(a.id);
      })
      .catch(fresh);
  }, [mistakesMode, unitMode, quiz.data, items, attemptId, resume]);

  const loading = unitMode ? unitQs.isPending : mistakesMode ? mistakes.isPending : quiz.isPending;
  if (loading || items === null || (resume && attemptId === null && !mistakesMode && !unitMode)) return <PageSkeleton label="Getting your questions ready." />;
  if (quiz.isError || mistakes.isError || unitQs.isError) return <ErrorState title="We could not load this quiz" onRetry={() => (mistakesMode ? mistakes.refetch() : quiz.refetch())}>Check your connection, then try again.</ErrorState>;
  if (!mistakesMode && !unitMode && !quiz.data) return <ErrorState title="This quiz is not here anymore">It may have been deleted. <Link to="/review">Back to review</Link>.</ErrorState>;
  if (items.length === 0)
    return (
      <section className="mx-auto flex max-w-xl flex-col gap-4">
        <h1 className="text-[2rem]">Nothing to revisit</h1>
        <p className="text-muted">You have no open mistakes{topic ? ` in ${topic}` : ""}. Questions you miss in a quiz appear here.</p>
        <Button asChild><Link to="/review">Back to review</Link></Button>
      </section>
    );

  const title = unitMode ? `Practise ${unit ? unitName(unit) : "this unit"}` : mistakesMode ? `Mistake review${topic ? `: ${topic}` : ""}` : quiz.data!.quiz.title;

  // ----- Results -----
  if (i >= items.length) {
    const correct = answers.filter((a) => a.correct).length;
    const pct = Math.round((correct / items.length) * 100);
    const missed = items.length - correct;
    const last = quiz.data?.last;
    const lastPct = last && last.total ? Math.round((last.correct / last.total) * 100) : null;
    const delta = lastPct === null ? null : pct - lastPct;
    // Weak spots by topic (rules only), and the unit to practise next.
    const topics = topicBreakdown(answers, (qid) => items.find((x) => x.id === qid)?.topic);
    const weakest = topics.length > 1 && topics[0].pct < 100 ? topics[0] : null;
    const quizUnit = unitMode ? unitId : sources.data?.find((x) => x.id === quiz.data?.quiz.source_id)?.unit_id ?? null;
    const unitOfQuiz = units.data?.find((u) => u.id === quizUnit);
    return (
      <section className="mx-auto flex max-w-xl flex-col gap-4">
        <div className="ink-panel pop p-6">
          <span className="circle circle-big right-[-4rem] top-[-5rem] size-52" aria-hidden="true" />
          <span className="circle circle-hot right-8 top-8 size-8" aria-hidden="true" />
          <p className="ink-muted text-[0.9375rem]">{title}</p>
          <p className="big-num mt-2 text-[5rem]">{pct}%<span className="ml-2 font-body text-[1.125rem] tracking-normal tabular">{correct} of {items.length}</span></p>
          <p className="ink-muted mt-2">
            {mistakesMode
              ? correct === items.length ? "Every one is cleared from mistake review." : `${correct} cleared. ${missed} stay in mistake review for next time.`
              : [
                  delta === null ? null : delta > 0 ? `That is ${delta} points above your last try.` : delta === 0 ? "Same as your last try." : `${-delta} points below your last try. Worth another look.`,
                  missed ? `${missed} ${missed === 1 ? "question went" : "questions went"} to your mistake review.` : "Every answer landed.",
                ].filter(Boolean).join(" ")}
          </p>
        </div>
        {topics.length > 1 && (
          <div className="card p-5">
            <p className="font-bold">By topic</p>
            <div className="mt-3 flex flex-col gap-2">
              {topics.map((t) => (
                <div key={t.topic} className="grid grid-cols-[1fr_6rem_3rem] items-center gap-3 text-[0.9375rem]">
                  <span className="truncate">{t.topic}{weakest?.topic === t.topic && <span className="ml-2 rounded-full bg-tint px-2 py-0.5 text-[0.75rem] font-bold text-brand">Weak spot</span>}</span>
                  <div className="bar" role="img" aria-label={`${t.topic}: ${t.right} of ${t.total}`}><span style={{ width: `${t.pct}%` }} /></div>
                  <b className="text-right tabular">{t.right}/{t.total}</b>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="callout neutral">
          <span>
            <b>Next step: </b>
            {missed === 0
              ? unitOfQuiz && !unitMode ? `try the mixed quiz for ${unitName(unitOfQuiz)} to check it all fits together.` : "you know this well. Come back in a few days to keep it fresh."
              : weakest ? `look again at ${weakest.topic}, then retry what you missed in mistake review.` : "retry what you missed in mistake review while it is fresh."}
          </span>
        </p>
        {missed > 0 && !mistakesMode && <Button asChild><Link to="/mistakes"><RotateCcw /> See mistake review</Link></Button>}
        {missed === 0 && unitOfQuiz && !unitMode && <Button asChild><Link to={`/quiz/unit?unit=${unitOfQuiz.id}`}>Practise {unitName(unitOfQuiz)}</Link></Button>}
        <Button variant="secondary" onClick={() => { setI(0); setPick(null); setChecked(false); setHint(false); setAnswers([]); setAttemptId(null); qc.invalidateQueries({ queryKey: ["quiz", id] }); if (unitMode) void unitQs.refetch(); }}>{unitMode ? "New mix" : "Try again"}</Button>
        <Button variant="ghost" asChild><Link to="/review">Back to review</Link></Button>
      </section>
    );
  }

  // ----- Question -----
  const q = items[i];
  const isRight = pick === q.answer_index;
  const qSubjectId = mistakesMode ? (q as Item & { subject_id?: string }).subject_id ?? null : quiz.data?.quiz.subject_id ?? unit?.subject_id ?? null;

  async function check() {
    if (pick === null) return;
    setChecked(true);
    const next = [...answers, { q: q.id, chosen: pick, correct: isRight }];
    setAnswers(next);
    try {
      await recordAnswer({
        attemptId: attemptId || null, questionId: q.id, chosen: pick, correct: isRight,
        answers: next as unknown as Json[], correctSoFar: next.filter((a) => a.correct).length, finished: next.length === items!.length,
      });
      qc.invalidateQueries({ queryKey: ["mistakes"] });
      qc.invalidateQueries({ queryKey: ["quiz-list"] });
      qc.invalidateQueries({ queryKey: ["unfinished-quiz"] });
    } catch {
      toast("We could not save that answer. Check your connection; your quiz continues.");
    }
  }

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4" aria-label="Practice quiz">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="grid size-11 place-items-center rounded-full border-2 border-line bg-card" aria-label="Close quiz">
          <X className="size-5" />
        </button>
        <div className="segments flex-1" role="img" aria-label={`Question ${i + 1} of ${items.length}`}>
          {items.map((_, n) => <span key={n} className={n < i ? "done" : n === i ? "now" : ""} />)}
        </div>
        <b className="text-[0.9375rem] tabular">{i + 1} of {items.length}</b>
      </div>

      <div className="card p-5">
        <span className="chip !text-[0.8125rem]">{q.topic || title}</span>
        <h1 id={`q-${q.id}`} className="mt-3 text-[1.375rem] leading-snug"><MathText text={q.prompt} /></h1>
      </div>

      <div role="radiogroup" aria-labelledby={`q-${q.id}`} className="flex flex-col gap-2">
        {q.options.map((o, k) => {
          const correct = checked && k === q.answer_index;
          const wrong = checked && k === pick && !isRight;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={pick === k}
              disabled={checked}
              onClick={() => setPick(k)}
              className={`card flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left font-bold !shadow-[0_3px_0_var(--line)] ${pick === k && !checked ? "!border-primary !bg-tint !shadow-[0_3px_0_var(--primary)]" : ""} ${correct ? "!border-primary !bg-tint !shadow-[0_3px_0_var(--primary)]" : ""} ${wrong ? "!border-line-strong !bg-soft" : ""}`}
            >
              <span className={`grid size-8 flex-none place-items-center rounded-full text-[0.875rem] ${pick === k || correct ? "bg-primary text-white" : "bg-soft"}`}>{"ABCD"[k]}</span>
              <span className="flex-1"><MathText text={o} /></span>
              {correct && <span className="flex items-center gap-1 text-[0.8125rem] text-brand"><Check className="size-4" />Correct</span>}
              {wrong && <span className="flex items-center gap-1 text-[0.8125rem] text-muted"><X className="size-4" />Your answer</span>}
            </button>
          );
        })}
      </div>

      {hint && !checked && q.hint && (
        <div role="status" className="sheet-in rounded-[1.25rem] border-2 border-tint-line bg-tint p-4">
          <p className="flex items-center gap-2 font-display text-[1.125rem] font-bold text-brand"><Lightbulb className="size-5" /> Hint</p>
          <p className="mt-1"><MathText text={q.hint} /></p>
        </div>
      )}
      {checked && (
        <div role="status" className="sheet-in rounded-[1.25rem] border-2 border-tint-line bg-tint p-4">
          <p className="flex items-center gap-2 font-display text-[1.125rem] font-bold text-brand">
            {isRight ? <Check className="size-5" /> : <Info className="size-5" />}
            {isRight ? "Correct" : "Not quite, and that is useful to know"}
          </p>
          <p className="mt-1"><MathText text={q.explanation} />{!isRight && " Added to your mistake review."}</p>
          <PageChips pages={q.pages} kind={q.kind} />
          <ReportButton itemType="quiz_question" itemId={q.id} subjectId={qSubjectId} className="mt-2 -ml-3" />
        </div>
      )}

      <div className="flex gap-2">
        {!checked ? (
          <>
            {q.hint && <Button variant="secondary" onClick={() => setHint(true)} disabled={hint}>Hint</Button>}
            <Button className="flex-1" disabled={pick === null} onClick={check}>Check answer</Button>
          </>
        ) : (
          <Button block onClick={() => { setI((n) => n + 1); setPick(null); setChecked(false); setHint(false); }}>
            {i + 1 === items.length ? "See results" : "Continue"}
          </Button>
        )}
      </div>
    </section>
  );
}
