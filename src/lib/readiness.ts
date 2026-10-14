// Readiness for a test, or for one unit it covers. Rules only, pure, unit tested.

export type ReadinessLevel = "ready" | "getting" | "needs";
export type Readiness = { level: ReadinessLevel; label: string; reason: string };
export const READINESS_LABEL: Record<ReadinessLevel, string> = { ready: "Ready", getting: "Getting there", needs: "Needs work" };

export type ReadinessInput = {
  /** Every card in scope: state 0 new, 1 learning, 2 review, 3 relearning. */
  cards: { state: number }[];
  /** Latest score of each practice quiz taken in scope. */
  quizzes: { correct: number; total: number }[];
  /** Practice quizzes in scope that could be taken. */
  quizzesAvailable: number;
  /** Open quiz mistakes in scope. */
  mistakes: number;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Ready: nearly every card studied, most of them in long-term review, quizzes at 80% or better (and
 * taken, if there are any), and at most a couple of mistakes left. Needs work: under half the cards
 * studied, a quiz average under 60%, or under a third of the cards remembered. Otherwise getting
 * there. The reason is the one thing that would help most. Null when there is nothing to measure.
 */
export function readiness(r: ReadinessInput): Readiness | null {
  const cards = r.cards.length;
  const taken = r.quizzes.filter((q) => q.total > 0);
  if (!cards && !r.quizzesAvailable) return null;

  const unseen = r.cards.filter((c) => c.state === 0).length;
  const remembered = r.cards.filter((c) => c.state === 2).length;
  const coverage = cards ? 1 - unseen / cards : 1;
  const memory = cards ? remembered / cards : 1;
  const quizPct = taken.length ? Math.round((100 * taken.reduce((n, q) => n + q.correct, 0)) / taken.reduce((n, q) => n + q.total, 0)) : null;

  const reasons: string[] = [];
  if (cards && coverage < 0.9) reasons.push(`${plural(unseen, "card")} not studied yet`);
  if (quizPct != null && quizPct < 80) reasons.push(`Quizzes at ${quizPct}%`);
  if (quizPct == null && r.quizzesAvailable) reasons.push("No practice quiz taken yet");
  if (cards && memory < 0.7 && coverage >= 0.9) reasons.push(`${plural(cards - remembered, "card")} still being learned`);
  if (r.mistakes > 2) reasons.push(`${plural(r.mistakes, "quiz mistake")} to go over`);

  const needs = (cards > 0 && coverage < 0.5) || (quizPct != null && quizPct < 60) || (cards > 0 && memory < 1 / 3 && coverage >= 0.5);
  const level: ReadinessLevel = !reasons.length ? "ready" : needs ? "needs" : "getting";
  const reason = level === "ready"
    ? [cards ? `All ${plural(cards, "card")} studied` : null, quizPct != null ? `quizzes at ${quizPct}%` : null].filter(Boolean).join(", ")
    : reasons[0];
  return { level, label: READINESS_LABEL[level], reason: reason.charAt(0).toUpperCase() + reason.slice(1) };
}
