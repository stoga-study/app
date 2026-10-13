import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Layers, PenLine, RotateCcw, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import type { Grade } from "../../supabase/functions/_lib/grade";
import { RATING, type Verdict } from "../../supabase/functions/_lib/grade";
import { MathText } from "@/components/MathText";
import { PageChips } from "@/components/PageChips";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/session";
import { pickPractice } from "@/lib/cardsOrg";
import { rate } from "@/lib/fsrs";
import type { Grade as FsrsGrade } from "ts-fsrs";
import { enqueueReview } from "@/lib/offline/outbox";
import { useGrading } from "@/lib/preferences";
import { endOfToday } from "@/lib/queries/cards";
import { GradeError, gradeAnswer } from "@/lib/queries/grade";
import { useClassCards, useDeckCardList, useDecks, type OrgCard } from "@/lib/queries/organise";
import { useRetention, useSubjects } from "@/lib/queries/profile";
import type { ReviewCard } from "@/lib/queries/review";
import { SimilarError, similarCard } from "@/lib/queries/similar";
import { useUnits } from "@/lib/queries/units";
import { unitName } from "@/lib/units";

const SIZES = [5, 10, 20];
const VERDICT: Record<Verdict, { label: string; tone: string }> = {
  right: { label: "Right", tone: "bg-[#E3F4EA] text-[#14532D] dark:bg-[#123524] dark:text-[#B7F0CC]" },
  partly: { label: "Partly right", tone: "bg-[#FFF4D6] text-[#713F12] dark:bg-[#3A2C0A] dark:text-[#FDE68A]" },
  not_yet: { label: "Not yet", tone: "bg-tint text-brand" },
};
const GRADE_ERROR: Record<GradeError["code"], string> = {
  grade_limit: "That is today's AI checks. Grade this one yourself; more tomorrow.",
  key_invalid: "Your own key did not work. Grade this one yourself, and check the key in Settings.",
  busy: "AI checking is busy. Grade this one yourself.",
  unavailable: "AI checking did not work this time. Grade this one yourself.",
  offline: "You are offline. Grade this one yourself.",
};
const SIMILAR_ERROR: Record<SimilarError["code"], string> = {
  limit: "That is today's follow-up questions. More tomorrow.",
  key_invalid: "Your own key did not work. Check it in Settings.",
  busy: "Stoga.study is busy right now. Try again in a minute.",
  unavailable: "We could not make one right now. Try again in a moment.",
  offline: "You are offline. This needs a connection.",
};

/** /practice: type your answers to cards from a class, a unit or a deck, then check them. */
export default function Practice() {
  const [params] = useSearchParams();
  const subjectId = params.get("subject");
  const unitId = params.get("unit");
  const deckId = params.get("deck");
  const n = SIZES.includes(Number(params.get("n"))) ? Number(params.get("n")) : 10;
  const subjects = useSubjects();
  const classCards = useClassCards(deckId ? undefined : subjectId ?? undefined);
  const deckCards = useDeckCardList(deckId ?? undefined);
  const units = useUnits(subjectId ?? undefined);
  const decks = useDecks();

  if (!subjectId && !deckId) return <PickScope n={n} />;
  const q = deckId ? deckCards : classCards;
  if (q.isPending || (unitId && units.isPending) || subjects.isPending) return <PageSkeleton label="Getting your cards ready." />;
  const pool = (q.data ?? []).filter((c) => !unitId || c.sources?.unit_id === unitId);
  const title = deckId
    ? decks.data?.find((d) => d.id === deckId)?.name ?? "Deck"
    : unitId ? unitName(units.data?.find((u) => u.id === unitId) ?? { number: null, title: "This unit" }) : subjects.data?.find((s) => s.id === subjectId)?.name ?? "Class";
  const back = deckId ? `/decks/${deckId}` : `/subjects/${subjectId}`;
  if (!pool.length)
    return (
      <EmptyState icon={<PenLine />} title="No cards to practise yet" action={<Button asChild><Link to={back}>Back</Link></Button>}>
        Short-answer practice uses your flashcards. Make some from a file, or write your own.
      </EmptyState>
    );
  return <Session key={`${deckId}-${subjectId}-${unitId}-${n}`} start={pickPractice(pool, n, endOfToday())} title={title} back={back} />;
}

/** /practice with no class or deck: choose one. */
function PickScope({ n }: { n: number }) {
  const subjects = useSubjects();
  const decks = useDecks();
  return (
    <>
      <PageHeader title="Short-answer practice">Type your answer to each card, then check it. Writing it out is one of the best ways to remember.</PageHeader>
      <h2 className="mb-3 text-[1.25rem]">Pick a class</h2>
      <div className="mb-6 flex flex-wrap gap-2">
        {subjects.data?.map((s) => <Link key={s.id} to={`/practice?subject=${s.id}&n=${n}`} className="pill-option no-underline">{s.name}</Link>)}
      </div>
      {!!decks.data?.length && (
        <>
          <h2 className="mb-3 text-[1.25rem]">Or a deck</h2>
          <div className="flex flex-wrap gap-2">
            {decks.data.map((d) => <Link key={d.id} to={`/practice?deck=${d.id}&n=${n}`} className="pill-option no-underline"><Layers />{d.name}</Link>)}
          </div>
        </>
      )}
    </>
  );
}

type Result = { card: OrgCard; verdict: Verdict };

function Session({ start, title, back }: { start: OrgCard[]; title: string; back: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { session } = useAuth();
  const retention = useRetention().value;
  const [mode, setMode] = useGrading();
  const [cards, setCards] = useState(start);
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState("");
  // answer: typing. checking: waiting for the AI. reveal: grading yourself. graded: verdict shown.
  const [phase, setPhase] = useState<"answer" | "checking" | "reveal" | "graded">("answer");
  const [grade, setGrade] = useState<(Grade & { by: "ai" | "self" }) | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  // Cards whose review was already recorded this visit ("Practise these again" does not count twice).
  const [reviewed, setReviewed] = useState<Set<string>>(() => new Set());
  const [makingSimilar, setMakingSimilar] = useState(false);
  const card = cards[i];

  /** "Give me one like this": a fresh variant slotted in right after this card, so it comes up next. */
  async function giveMeOneLikeThis() {
    setMakingSimilar(true);
    try {
      const made = await similarCard(card.id);
      setCards((c) => [...c.slice(0, i + 1), made, ...c.slice(i + 1)]);
      next();
    } catch (e) {
      toast(SIMILAR_ERROR[e instanceof SimilarError ? e.code : "unavailable"]);
    } finally {
      setMakingSimilar(false);
    }
  }

  async function check() {
    if (mode === "self") return setPhase("reveal");
    setPhase("checking");
    try {
      setGrade({ ...(await gradeAnswer(card.id, answer)), by: "ai" });
      setPhase("graded");
    } catch (e) {
      toast(GRADE_ERROR[e instanceof GradeError ? e.code : "unavailable"]);
      setPhase("reveal");
    }
  }

  /** Save the verdict. A card that is due today counts as its review (right is Good, partly Hard, not yet Again). */
  function next() {
    if (!grade) return;
    if (!reviewed.has(card.id) && new Date(card.due) <= endOfToday()) {
      setReviewed((s) => new Set(s).add(card.id));
      const now = new Date();
      const { row, state } = rate(card, RATING[grade.verdict] as FsrsGrade, now, retention);
      void enqueueReview({ client_id: crypto.randomUUID(), card_id: card.id, schedule: row, rating: RATING[grade.verdict], state, reviewed_at: now.toISOString() });
      qc.setQueryData<ReviewCard[]>(["due-queue", session?.user.id], (q) => q?.filter((c) => c.id !== card.id));
      qc.invalidateQueries({ queryKey: ["due-cards"] });
    }
    setResults((r) => [...r, { card, verdict: grade.verdict }]);
    setI((x) => x + 1);
    setAnswer("");
    setGrade(null);
    setPhase("answer");
  }

  if (!card) {
    const count = (v: Verdict) => results.filter((r) => r.verdict === v).length;
    const misses = results.filter((r) => r.verdict !== "right").map((r) => r.card);
    return (
      <section className="mx-auto flex max-w-xl flex-col gap-4">
        <div className="ink-panel pop p-6">
          <span className="circle circle-big right-[-4rem] top-[-5rem] size-52" aria-hidden="true" />
          <p className="ink-muted text-[0.9375rem]">Short-answer practice, {title}</p>
          <p className="big-num mt-2 text-[5rem]">{count("right")}<span className="ml-2 font-body text-[1.125rem] tracking-normal">of {results.length} right</span></p>
          <p className="ink-muted mt-2">{count("partly")} partly right, {count("not_yet")} not yet. Due cards were counted as today&apos;s review.</p>
        </div>
        {misses.length > 0 && (
          <div className="card p-5">
            <p className="font-bold">Worth another go</p>
            <ul className="mt-2 flex flex-col gap-1.5 text-[0.9375rem]">{misses.map((c) => <li key={c.id}><MathText text={c.front} /></li>)}</ul>
          </div>
        )}
        {misses.length > 0 && (
          <Button onClick={() => { setCards(misses); setI(0); setResults([]); }}><RotateCcw /> Practise these {misses.length} again</Button>
        )}
        <Button asChild variant={misses.length ? "secondary" : "primary"}><Link to={back}>Done</Link></Button>
      </section>
    );
  }

  const kind = card.sources?.kind ?? "pdf";
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4" aria-label="Short-answer practice">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="grid size-11 place-items-center rounded-full" aria-label="Leave practice"><ArrowLeft className="size-5" /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[1.25rem] font-bold">{title}</p>
          <p className="text-[0.875rem] text-muted tabular">Question {i + 1} of {cards.length}</p>
        </div>
        <div className="inline-flex rounded-full bg-soft p-1" role="radiogroup" aria-label="Checking">
          {(["ai", "self"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={phase !== "answer"} onClick={() => setMode(m)}
              className={`min-h-8 rounded-full px-3 text-[0.8125rem] font-bold ${mode === m ? "bg-primary text-white" : "text-muted"}`}>
              {m === "ai" ? "AI checks" : "I check"}
            </button>
          ))}
        </div>
      </div>
      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={cards.length} aria-valuenow={i} aria-label="Practice progress"><span style={{ width: `${(i / cards.length) * 100}%` }} /></div>

      <div className="card p-6">
        <span className="chip !text-[0.8125rem]">Question</span>
        <h1 className="mt-3 text-[1.5rem] leading-tight"><MathText text={card.front} /></h1>
      </div>

      <label htmlFor="answer" className="field-label">Your answer</label>
      <textarea
        id="answer"
        className="input min-h-28"
        maxLength={1500}
        autoFocus
        readOnly={phase !== "answer"}
        placeholder="Type it in your own words"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && phase === "answer") { e.preventDefault(); void check(); } }}
      />

      {phase === "answer" && (
        <div className="flex flex-wrap gap-2">
          <Button className="flex-1" onClick={check}>{mode === "ai" ? <><Sparkles /> Check my answer</> : <><Check /> Show the answer</>}</Button>
          <Button variant="ghost" onClick={() => setPhase("reveal")}>I don&apos;t know</Button>
        </div>
      )}
      {phase === "checking" && <p className="text-center text-muted" aria-live="polite">Checking…</p>}

      {(phase === "reveal" || phase === "graded") && (
        <div className="card flex flex-col gap-3 p-5" aria-live="polite">
          {grade && (
            <>
              <span className={`self-start rounded-full px-3 py-1 text-[0.875rem] font-bold ${VERDICT[grade.verdict].tone}`}>{VERDICT[grade.verdict].label}</span>
              {grade.by === "ai" && <p>{grade.feedback}</p>}
              {grade.missing.length > 0 && (
                <ul className="flex flex-col gap-1 text-[0.9375rem] text-ink-2">{grade.missing.map((m) => <li key={m} className="flex gap-2"><X className="mt-1 size-4 flex-none text-brand" />{m}</li>)}</ul>
              )}
            </>
          )}
          <div className="rounded-2xl bg-soft p-4">
            <p className="text-[0.8125rem] font-bold text-muted">Answer</p>
            <p className="mt-1"><MathText text={card.back} /></p>
            {card.pages.length > 0 && <div className="mt-2"><PageChips pages={card.pages} kind={kind} quote={card.quote} sourceId={card.source_id} /></div>}
          </div>
          {phase === "reveal" && (
            <div>
              <p className="mb-2 text-[0.9375rem] text-muted">How did you do?</p>
              <div className="grid grid-cols-3 gap-2">
                {(["not_yet", "partly", "right"] as const).map((v) => (
                  <Button key={v} variant="secondary" onClick={() => { setGrade({ verdict: v, feedback: "", missing: [], by: "self" }); setPhase("graded"); }}>{VERDICT[v].label}</Button>
                ))}
              </div>
            </div>
          )}
          {phase === "graded" && grade && (
            <div className="flex flex-wrap gap-2">
              <Button className="flex-1" onClick={next}>{i + 1 === cards.length ? "See how you did" : "Next"}</Button>
              {grade.by === "ai" && grade.verdict !== "right" && (
                <Button variant="ghost" onClick={() => setGrade({ ...grade, verdict: "right", missing: [] })}>I was right</Button>
              )}
              <Button variant="ghost" onClick={giveMeOneLikeThis} disabled={makingSimilar}>
                <Sparkles /> {makingSimilar ? "Making one…" : "Give me one like this"}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
