// Topic mastery and session summaries. Rules only (no AI), and pure, so they are unit tested.

/** About three weeks of memory strength counts as mastered. */
export const MASTERED_DAYS = 21;

type CardState = { state: number; stability: number };

/** One card's mastery, 0 to 1: new is 0, learning a little, then growing with memory strength. */
export function cardScore(c: CardState): number {
  if (c.state === 0) return 0;
  if (c.state === 1 || c.state === 3) return 0.15; // learning or relearning
  return Math.min(1, 0.25 + 0.75 * (c.stability / MASTERED_DAYS));
}

export type MasteryLabel = "Not started" | "Just started" | "Getting there" | "Mastered";
export type Mastery = { score: number; label: MasteryLabel; cards: number; mastered: number; quizPct: number | null };

/**
 * Mastery of a unit or class: cards count for 70% and the latest quiz scores for 30%. When there are
 * only cards or only quizzes, that one counts fully. Null when there is nothing to measure.
 */
export function mastery(cards: CardState[], quizzes: { correct: number; total: number }[]): Mastery | null {
  const taken = quizzes.filter((q) => q.total > 0);
  if (!cards.length && !taken.length) return null;
  const cardPart = cards.length ? cards.reduce((n, c) => n + cardScore(c), 0) / cards.length : null;
  const quizPart = taken.length ? taken.reduce((n, q) => n + q.correct, 0) / taken.reduce((n, q) => n + q.total, 0) : null;
  const score = cardPart != null && quizPart != null ? 0.7 * cardPart + 0.3 * quizPart : (cardPart ?? quizPart)!;
  const touched = cards.some((c) => c.state !== 0) || taken.length > 0;
  const label: MasteryLabel = !touched ? "Not started" : score >= 0.8 ? "Mastered" : score >= 0.4 ? "Getting there" : "Just started";
  return {
    score: Math.round(score * 100) / 100,
    label,
    cards: cards.length,
    mastered: cards.filter((c) => cardScore(c) >= 1).length,
    quizPct: quizPart == null ? null : Math.round(quizPart * 100),
  };
}

/** Quiz results by topic, weakest first, for "weak spots" after a quiz. */
export function topicBreakdown(answers: { q: string; correct: boolean }[], topicOf: (q: string) => string | null | undefined) {
  const by = new Map<string, { right: number; total: number }>();
  for (const a of answers) {
    const t = topicOf(a.q)?.trim() || "Other";
    const x = by.get(t) ?? { right: 0, total: 0 };
    x.total++;
    if (a.correct) x.right++;
    by.set(t, x);
  }
  return [...by].map(([topic, x]) => ({ topic, ...x, pct: Math.round((x.right / x.total) * 100) })).sort((a, b) => a.pct - b.pct || b.total - a.total);
}

export type NextStep = { kind: "keep_going" | "type_misses" | "weak_cards" | "unit_quiz" | "done"; text: string };

/**
 * One next step after a review session. Rules, in order: more due, then a rough session (a third or
 * more missed), then weak cards waiting, then the unit quiz, else done for now.
 */
export function reviewNextStep(o: { reviewed: number; again: number; left: number; weak: number; unitQuiz: boolean }): NextStep {
  if (o.left > 0) return { kind: "keep_going", text: `${o.left} more ${o.left === 1 ? "card is" : "cards are"} due. Another short round locks them in.` };
  if (o.reviewed > 0 && o.again / o.reviewed >= 1 / 3)
    return { kind: "type_misses", text: "A few did not stick yet. Typing out the answers is a great way to fix that." };
  if (o.weak > 0) return { kind: "weak_cards", text: `${o.weak} weak ${o.weak === 1 ? "card is" : "cards are"} worth a quick extra round.` };
  if (o.unitQuiz) return { kind: "unit_quiz", text: "Cards are done. Try the unit quiz to see how it all fits together." };
  return { kind: "done", text: "That is everything for now. Nice work." };
}
