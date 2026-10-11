import { fsrs, generatorParameters, Rating, type Card, type Grade } from "ts-fsrs";

// Spaced repetition (FSRS). Cards come back just before they would be forgotten.
// Fuzz spreads reviews so a batch of new cards does not all return on the same day.
export const scheduler = fsrs(generatorParameters({ enable_fuzz: true, request_retention: 0.9 }));

export type CardRow = {
  due: string; stability: number; difficulty: number; elapsed_days: number; scheduled_days: number;
  learning_steps: number; reps: number; lapses: number; state: number; last_review: string | null;
};

export const GRADES: { grade: Grade; label: string }[] = [
  { grade: Rating.Again, label: "Again" },
  { grade: Rating.Hard, label: "Hard" },
  { grade: Rating.Good, label: "Good" },
  { grade: Rating.Easy, label: "Easy" },
];

export function toCard(r: CardRow): Card {
  return {
    due: new Date(r.due), stability: r.stability, difficulty: r.difficulty, elapsed_days: r.elapsed_days,
    scheduled_days: r.scheduled_days, learning_steps: r.learning_steps, reps: r.reps, lapses: r.lapses,
    state: r.state, last_review: r.last_review ? new Date(r.last_review) : undefined,
  };
}

export function toRow(c: Card): CardRow {
  return {
    due: c.due.toISOString(), stability: c.stability, difficulty: c.difficulty, elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days, learning_steps: c.learning_steps, reps: c.reps, lapses: c.lapses,
    state: c.state, last_review: c.last_review ? c.last_review.toISOString() : null,
  };
}

/** The next schedule after rating a card, plus the review log fields. */
export function rate(row: CardRow, grade: Grade, now = new Date()) {
  const { card, log } = scheduler.next(toCard(row), now, grade);
  return { row: toRow(card), state: log.state };
}

/** "<1 min", "10 min", "1 day", "3 days", "2 mo": how long until the card returns for each rating. */
export function intervalLabel(due: Date, now = new Date()) {
  const exact = (due.getTime() - now.getTime()) / 60000;
  if (exact < 1) return "<1 min";
  const mins = Math.round(exact);
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} ${days === 1 ? "day" : "days"}`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months} mo` : `${Math.round(months / 12)} yr`;
}

export function previewIntervals(row: CardRow, now = new Date()) {
  const preview = scheduler.repeat(toCard(row), now);
  return GRADES.map(({ grade, label }) => ({ grade, label, when: intervalLabel(preview[grade].card.due, now) }));
}
