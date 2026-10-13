import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, MessageCircleQuestion, Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { MathText } from "@/components/MathText";
import { PageChips } from "@/components/PageChips";
import { ReportButton } from "@/components/ReportButton";
import { ErrorState, PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { GRADES, isWeak, previewIntervals, rate } from "@/lib/fsrs";
import type { Grade } from "ts-fsrs";
import { enqueueReview } from "@/lib/offline/outbox";
import { useAuth } from "@/lib/auth/session";
import { sizeParam } from "@/lib/preferences";
import { useRetention, useSubjects } from "@/lib/queries/profile";
import { useDeckCardList, useDecks } from "@/lib/queries/organise";
import { inScope, useDueQueue, useEditCard, useNextDue, useWeakCards, type ReviewCard } from "@/lib/queries/review";
import { useUnits } from "@/lib/queries/units";
import { reviewNextStep } from "@/lib/mastery";
import { useUnitQuestionCounts } from "@/lib/queries/quiz";
import { unitName } from "@/lib/units";
import { clearRecent, setRecent } from "@/lib/recent";

const REQUEUE_MINUTES = 20; // cards marked Again that are due within this window come back in this session

export default function ReviewSession() {
  const [params] = useSearchParams();
  const subjectId = params.get("subject");
  const unitId = params.get("unit");
  const size = sizeParam(params.get("size"));
  const weakMode = params.get("mode") === "weak";
  const deckId = params.get("deck");
  // ?deck=…&mode=all practises a whole deck, due or not.
  const allMode = !!deckId && params.get("mode") === "all";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { session } = useAuth();
  const subjects = useSubjects();
  const units = useUnits(subjectId ?? undefined);
  const unitQuestions = useUnitQuestionCounts(unitId ? subjectId ?? undefined : undefined);
  const retention = useRetention().value;
  const dueQuery = useDueQueue();
  const weakQuery = useWeakCards();
  const deckQuery = useDeckCardList(deckId ?? undefined);
  const decks = useDecks();
  const deckName = decks.data?.find((d) => d.id === deckId)?.name ?? "Deck";
  const due = weakMode ? weakQuery : allMode ? deckQuery : dueQuery;
  const scope = { subjectId, unitId, cardIds: deckId && !allMode && deckQuery.data ? new Set(deckQuery.data.map((c) => c.id)) : null };
  const first = due.data ? inScope(due.data, { ...scope, size }) : undefined;
  const nextDue = useNextDue();
  const edit = useEditCard();

  // The session's own queue; until the first rating it is simply the cards that were due.
  const [ownQueue, setOwnQueue] = useState<ReviewCard[] | null>(null);
  const queue = ownQueue ?? first ?? null;
  const setQueue = (fn: (q: ReviewCard[] | null) => ReviewCard[] | null) => setOwnQueue(() => fn(queue));
  const [flipped, setFlipped] = useState(false);
  const [editing, setEditing] = useState<{ front: string; back: string } | null>(null);
  const [ratings, setRatings] = useState<number[]>([]);
  // Cards marked Again this session, for the summary's weak spots.
  const [missed, setMissed] = useState<ReviewCard[]>([]);
  // Cards already done this visit, so Keep going never repeats one (weak cards and whole decks stay listed).
  const [doneIds, setDoneIds] = useState<Set<string>>(() => new Set());
  const [startedAt, setStartedAt] = useState(() => Date.now());

  const card = queue?.[0];
  const subjectName = useMemo(() => (id?: string) => subjects.data?.find((s) => s.id === id)?.name ?? "", [subjects.data]);
  // Cheap to work out, and must follow the retention setting.
  const intervals = card ? previewIntervals(card, new Date(), retention) : [];

  const onRate = useCallback(
    (grade: number) => {
      if (!card) return;
      const now = new Date();
      const { row, state } = rate(card, grade as Grade, now, retention);
      void enqueueReview({ client_id: crypto.randomUUID(), card_id: card.id, schedule: row, rating: grade, state, reviewed_at: now.toISOString() });
      // The saved lists drop this card now, so the next session (even offline) does not repeat it.
      qc.setQueryData<ReviewCard[]>(["due-queue", session?.user.id], (q) => q?.filter((c) => c.id !== card.id));
      qc.setQueryData<ReviewCard[]>(["weak-cards", session?.user.id], (q) => q?.map((c) => (c.id === card.id ? { ...c, ...row } : c)).filter(isWeak));
      setRatings((r) => [...r, grade]);
      if (grade === 1) setMissed((m) => (m.some((c) => c.id === card.id) ? m : [...m, card]));
      setDoneIds((d) => new Set(d).add(card.id));
      setFlipped(false);
      setQueue((q) => {
        if (!q) return q;
        const rest = q.slice(1);
        const updated = { ...card, ...row };
        // Only missed cards return this session; Good and Easy keep their schedule (a new card's
        // short learning step brings it back later today instead of doubling the session).
        const soon = new Date(row.due).getTime() - now.getTime() <= REQUEUE_MINUTES * 60_000;
        return grade === 1 && soon ? [...rest, updated] : rest;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card, queue, retention],
  );

  // Keyboard: space flips, 1-4 rate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || !card || (e.target as HTMLElement)?.closest("input, textarea")) return;
      if (e.key === " ") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && ["1", "2", "3", "4"].includes(e.key)) onRate(Number(e.key));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, flipped, editing, onRate]);

  // A session left part-way is offered on Home; a finished one is forgotten.
  const here = useLocation();
  const href = here.pathname + here.search;
  const leftInSession = queue?.length ?? 0;
  const label = deckId ? deckName : weakMode ? "Weak cards" : unitId ? unitName(units.data?.find((u) => u.id === unitId) ?? { number: null, title: "Unit review" }) : subjectId ? subjectName(subjectId) || "Flashcard review" : "Flashcard review";
  useEffect(() => {
    if (!ratings.length) return;
    if (leftInSession > 0) setRecent({ kind: "review", href, label, sub: `${leftInSession} ${leftInSession === 1 ? "card" : "cards"} left` });
    else clearRecent(href);
  }, [ratings.length, leftInSession, href, label]);

  // Refresh counts elsewhere once the session ends.
  useEffect(() => {
    if (queue && queue.length === 0) {
      qc.invalidateQueries({ queryKey: ["due-cards"] });
      qc.invalidateQueries({ queryKey: ["next-due"] });
      qc.invalidateQueries({ queryKey: ["review-history"] });
    }
  }, [queue, qc]);

  // Wait for the fresh list when online, so cards do not change under the student a moment later.
  if (due.isPending || queue === null || (!ownQueue && !due.isFetchedAfterMount && due.isFetching) || (unitId && units.isPending) || (deckId && deckQuery.isPending)) return <PageSkeleton label="Getting your cards ready." />;
  if (due.isError) return <ErrorState title="We could not load your cards" onRetry={() => due.refetch()}>Check your connection, then try again.</ErrorState>;

  const scopeName = deckId ? deckName : weakMode ? "Weak cards" : unitId ? unitName(units.data?.find((u) => u.id === unitId) ?? { number: null, title: "This unit" }) : subjectId ? subjectName(subjectId) : "";
  // More due in the same scope after this session (the saved list already dropped what was reviewed).
  const pool = weakMode || allMode ? due.data : dueQuery.data;
  const left = pool ? inScope(pool, scope).filter((c) => !doneIds.has(c.id)).length : 0;
  const keepGoing = () => {
    setOwnQueue(inScope((due.data ?? []).filter((c) => !doneIds.has(c.id)), { ...scope, size }));
    setRatings([]);
    setStartedAt(() => Date.now());
  };

  if (!card) {
    const reviewed = ratings.length;
    const good = ratings.filter((r) => r >= 3).length;
    const mins = Math.max(1, Math.round((new Date().getTime() - startedAt) / 60000));
    const next = nextDue.data ? new Intl.DateTimeFormat("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" }).format(new Date(nextDue.data)) : null;
    if (reviewed === 0)
      return (
        <section className="mx-auto flex max-w-xl flex-col gap-4">
          <span className="chip self-start">Nothing overdue</span>
          <h1 className="text-[2.25rem]">All caught up</h1>
          <p className="text-muted">
            {allMode ? "This deck has no cards yet." : deckId ? `Nothing in ${deckName} is due today. You can practise the whole deck any time.` : weakMode ? "You have no weak cards right now. Cards you miss twice, or find hard, show up here." : `You have finished everything due${scopeName ? ` in ${scopeName}` : ""} today.${next ? ` Next cards are due ${next}.` : ""}`}
          </p>
          {deckId && !allMode && (deckQuery.data?.length ?? 0) > 0 && (
            <Button asChild><Link to={`/review/session?deck=${deckId}&mode=all${size ? `&size=${size}` : ""}`}>Practise the whole deck</Link></Button>
          )}
          <Button asChild variant={deckId && !allMode ? "secondary" : "primary"}><Link to={deckId ? `/decks/${deckId}` : "/review"}>{deckId ? "Back to the deck" : "Back to review"}</Link></Button>
        </section>
      );
    const counts = GRADES.map(({ grade, label }) => ({ label, n: ratings.filter((r) => r === grade).length }));
    const step = reviewNextStep({
      reviewed,
      again: ratings.filter((r) => r === 1).length,
      left,
      weak: weakMode ? 0 : weakQuery.data?.length ?? 0,
      unitQuiz: !!unitId && (unitQuestions.data?.[unitId] ?? 0) > 0,
    });
    const stepLink =
      step.kind === "type_misses" ? (deckId ? `/practice?deck=${deckId}` : subjectId ? `/practice?subject=${subjectId}${unitId ? `&unit=${unitId}` : ""}` : `/practice?subject=${missed[0]?.subject_id ?? ""}`)
        : step.kind === "weak_cards" ? `/review/session?mode=weak${size ? `&size=${size}` : ""}`
          : step.kind === "unit_quiz" ? `/quiz/unit?unit=${unitId}` : null;
    const stepLabel = { type_misses: "Type answers", weak_cards: "Practise weak cards", unit_quiz: "Take the unit quiz" } as Record<string, string>;
    return (
      <section className="mx-auto flex max-w-xl flex-col gap-4">
        <div className="ink-panel pop p-6">
          <span className="circle circle-big right-[-4rem] top-[-5rem] size-52" aria-hidden="true" />
          <span className="circle circle-hot right-8 top-8 size-8" aria-hidden="true" />
          <p className="ink-muted text-[0.9375rem]">Session complete{scopeName ? `, ${scopeName}` : ""}</p>
          <p className="big-num mt-2 text-[5rem]">{reviewed}<span className="ml-2 font-body text-[1.125rem] tracking-normal">{reviewed === 1 ? "card" : "cards"} reviewed</span></p>
          <p className="ink-muted mt-2">About {mins} {mins === 1 ? "minute" : "minutes"}. {good} of {reviewed} felt good or easy.</p>
        </div>
        <div className="card p-5">
          <p className="font-bold">How it felt</p>
          <div className="mt-3 flex flex-col gap-2">
            {counts.map((c) => (
              <div key={c.label} className="grid grid-cols-[4.5rem_1fr_2rem] items-center gap-3 text-[0.9375rem]">
                <span>{c.label}</span>
                <div className="bar" role="img" aria-label={`${c.label}: ${c.n}`}><span style={{ width: `${reviewed ? (c.n / reviewed) * 100 : 0}%` }} /></div>
                <b className="text-right tabular">{c.n}</b>
              </div>
            ))}
          </div>
          {next && <p className="mt-4 text-[0.9375rem] text-muted">Next cards are due {next}.</p>}
        </div>
        {missed.length > 0 && (
          <div className="card p-5">
            <p className="font-bold">Did not stick yet</p>
            <ul className="mt-2 flex flex-col gap-1.5 text-[0.9375rem]">
              {missed.slice(0, 5).map((c) => <li key={c.id}><MathText text={c.front} /></li>)}
            </ul>
            {missed.length > 5 && <p className="mt-1 text-[0.875rem] text-muted">and {missed.length - 5} more</p>}
          </div>
        )}
        <p className="callout neutral"><span><b>Next step: </b>{step.text}</span></p>
        {stepLink && <Button asChild variant={left > 0 ? "secondary" : "primary"}><Link to={stepLink}>{stepLabel[step.kind]}</Link></Button>}
        {left > 0 && <Button onClick={keepGoing}>Keep going: {left} more {weakMode ? "weak" : allMode ? "in this deck" : "due"}</Button>}
        <Button asChild variant={left > 0 || stepLink ? "secondary" : "primary"}><Link to="/">Back to today</Link></Button>
      </section>
    );
  }

  const done = ratings.length;
  const total = done + queue.length;
  const kind = card.sources?.kind ?? "pdf";

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4" aria-label="Flashcard review">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="grid size-11 place-items-center rounded-full" aria-label="Leave review">
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[1.25rem] font-bold">{scopeName || subjectName(card.subject_id) || "Flashcards"}</p>
          <p className="text-[0.875rem] text-muted tabular">Card {done + 1} of {total}. Review pace is up to you.</p>
        </div>
      </div>
      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Session progress">
        <span style={{ width: `${(done / total) * 100}%` }} />
      </div>

      {editing ? (
        <form
          className="card flex flex-col gap-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const front = editing.front.trim(), back = editing.back.trim();
            if (!front || !back) return;
            edit.mutate({ id: card.id, front, back }, {
              onSuccess: () => {
                setQueue((q) => (q ? [{ ...card, front, back, edited: true }, ...q.slice(1)] : q));
                setEditing(null);
                toast("Card saved.");
              },
              onError: () => toast("We could not save the card. Check your connection, then try again."),
            });
          }}
        >
          <span className="chip self-start"><Pencil /> Editing card</span>
          <label htmlFor="ef" className="field-label">Question</label>
          <textarea id="ef" className="input" maxLength={1000} value={editing.front} onChange={(e) => setEditing({ ...editing, front: e.target.value })} />
          <label htmlFor="eb" className="field-label">Answer</label>
          <textarea id="eb" className="input" maxLength={2000} value={editing.back} onChange={(e) => setEditing({ ...editing, back: e.target.value })} />
          <div className="flex gap-2">
            <Button type="submit" disabled={edit.isPending}>Save card</Button>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className={`card flex min-h-64 w-full flex-col gap-3 p-6 ${flipped ? "!border-tint-line !bg-tint" : ""}`}>
          <button type="button" onClick={() => setFlipped((f) => !f)} aria-live="polite" className="flex flex-1 flex-col gap-3 text-left">
            <span className="chip self-start !text-[0.8125rem]">{flipped ? "Answer" : "Question"}</span>
            <span className={flipped ? "text-[1.125rem] text-ink" : "font-display text-[1.5rem] font-bold leading-tight"}>{flipped ? <MathText text={card.back} /> : <MathText text={card.front} />}</span>
            {flipped && <span className="text-[0.9375rem] text-muted"><MathText text={card.front} /></span>}
          </button>
          {/* The quote would give the answer away before the card is flipped, so it only shows after. */}
          <span className="mt-auto"><PageChips pages={card.pages} kind={kind} quote={flipped ? card.quote : null} sourceId={card.source_id} /></span>
        </div>
      )}

      {!editing && (
        <div className="flex flex-wrap gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditing({ front: card.front, back: card.back })}>
            <Pencil /> Edit card
          </Button>
          {flipped && (
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/tutor/${card.subject_id}?explain=card:${card.id}`}><MessageCircleQuestion /> Explain this</Link>
            </Button>
          )}
          {flipped && <ReportButton itemType="card" itemId={card.id} subjectId={card.subject_id} />}
        </div>
      )}

      {!editing && (flipped ? (
        <div>
          <p className="mb-2 text-[0.875rem] text-muted">How did that feel?</p>
          <div className="grid grid-cols-4 gap-2">
            {intervals.map((iv, i) => (
              <button
                key={iv.label}
                type="button"
                onClick={() => onRate(iv.grade)}
                className="card flex min-h-14 flex-col items-center justify-center !rounded-[1rem] px-1 text-[0.9375rem] font-bold active:translate-y-0.5"
                aria-keyshortcuts={String(i + 1)}
              >
                {iv.label}
                <span className="text-[0.8125rem] font-normal text-muted">{iv.when}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <Button block onClick={() => setFlipped(true)}><Check /> Show answer</Button>
      ))}
    </section>
  );
}
