import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { MathText } from "@/components/MathText";
import { PageChips } from "@/components/PageChips";
import { ErrorState, PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { GRADES, previewIntervals, rate } from "@/lib/fsrs";
import type { Grade } from "ts-fsrs";
import { enqueueReview } from "@/lib/offline/outbox";
import { useSubjects } from "@/lib/queries/profile";
import { useDueQueue, useEditCard, useNextDue, type ReviewCard } from "@/lib/queries/review";

const REQUEUE_MINUTES = 20; // cards marked Again that are due within this window come back in this session

export default function ReviewSession() {
  const [params] = useSearchParams();
  const subjectId = params.get("subject");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const subjects = useSubjects();
  const due = useDueQueue(subjectId);
  const nextDue = useNextDue();
  const edit = useEditCard();

  // The session's own queue; until the first rating it is simply the cards that were due.
  const [ownQueue, setOwnQueue] = useState<ReviewCard[] | null>(null);
  const queue = ownQueue ?? due.data ?? null;
  const setQueue = (fn: (q: ReviewCard[] | null) => ReviewCard[] | null) => setOwnQueue(() => fn(queue));
  const [flipped, setFlipped] = useState(false);
  const [editing, setEditing] = useState<{ front: string; back: string } | null>(null);
  const [ratings, setRatings] = useState<number[]>([]);
  const [startedAt] = useState(() => Date.now());

  const card = queue?.[0];
  const subjectName = useMemo(() => (id?: string) => subjects.data?.find((s) => s.id === id)?.name ?? "", [subjects.data]);
  const intervals = useMemo(() => (card ? previewIntervals(card) : []), [card]);

  const onRate = useCallback(
    (grade: number) => {
      if (!card) return;
      const now = new Date();
      const { row, state } = rate(card, grade as Grade, now);
      void enqueueReview({ client_id: crypto.randomUUID(), card_id: card.id, schedule: row, rating: grade, state, reviewed_at: now.toISOString() });
      setRatings((r) => [...r, grade]);
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
    [card, queue],
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

  // Refresh counts elsewhere once the session ends.
  useEffect(() => {
    if (queue && queue.length === 0) {
      qc.invalidateQueries({ queryKey: ["due-cards"] });
      qc.invalidateQueries({ queryKey: ["next-due"] });
      qc.invalidateQueries({ queryKey: ["review-history"] });
    }
  }, [queue, qc]);

  if (due.isPending || queue === null) return <PageSkeleton label="Getting your cards ready." />;
  if (due.isError) return <ErrorState title="We could not load your cards" onRetry={() => due.refetch()}>Check your connection, then try again.</ErrorState>;

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
          <p className="text-muted">You have finished everything due today.{next ? ` Next cards are due ${next}.` : ""}</p>
          <Button asChild><Link to="/review">Back to review</Link></Button>
        </section>
      );
    const counts = GRADES.map(({ grade, label }) => ({ label, n: ratings.filter((r) => r === grade).length }));
    return (
      <section className="mx-auto flex max-w-xl flex-col gap-4">
        <div className="ink-panel pop p-6">
          <span className="circle circle-big right-[-4rem] top-[-5rem] size-52" aria-hidden="true" />
          <span className="circle circle-hot right-8 top-8 size-8" aria-hidden="true" />
          <p className="ink-muted text-[0.9375rem]">Session complete{subjectId ? `, ${subjectName(subjectId)}` : ""}</p>
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
        <Button asChild><Link to="/">Back to today</Link></Button>
        <Button asChild variant="secondary"><Link to="/review">Take a practice quiz</Link></Button>
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
          <p className="truncate font-display text-[1.25rem] font-bold">{subjectName(card.subject_id) || "Flashcards"}</p>
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
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-live="polite"
          className={`card flex min-h-64 w-full flex-col gap-3 p-6 text-left ${flipped ? "!border-tint-line !bg-tint" : ""}`}
        >
          <span className="chip self-start !text-[0.8125rem]">{flipped ? "Answer" : "Question"}</span>
          <span className={flipped ? "text-[1.125rem] text-ink" : "font-display text-[1.5rem] font-bold leading-tight"}>{flipped ? <MathText text={card.back} /> : <MathText text={card.front} />}</span>
          {flipped && <span className="text-[0.9375rem] text-muted"><MathText text={card.front} /></span>}
          <span className="mt-auto"><PageChips pages={card.pages} kind={kind} /></span>
        </button>
      )}

      {!editing && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setEditing({ front: card.front, back: card.back })}>
          <Pencil /> Edit card
        </Button>
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
