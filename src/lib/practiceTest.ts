// Timed practice tests: which questions to ask, how long to allow, and the score. Pure, unit tested.

export type McPick = { id: string; topic: string | null; missed: boolean };
export type CardPick = { id: string; state: number; lapses: number; difficulty: number };
export type TestItem = { kind: "mc"; id: string } | { kind: "sa"; id: string };
export type SaVerdict = "right" | "partly" | "not_yet";

export const MC_SECONDS = 75;
export const SA_SECONDS = 120;
export const LENGTHS = [10, 20, 30] as const;

/** AP classes lean on written answers, like their free-response sections; others are mostly multiple choice. */
export const shortAnswerShare = (ap: boolean) => (ap ? 0.4 : 0.25);

/** How weak a card looks: forgotten before, relearning, hard, or never studied. */
export const cardWeakness = (c: CardPick) => c.lapses * 2 + (c.state === 3 ? 3 : 0) + c.difficulty / 3 + (c.state === 0 ? 1 : 0);

function shuffle<T>(xs: T[], rand: () => number) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Up to `n` questions. Multiple choice puts questions answered wrong before first, then ones on the
 * weakest topics, then the rest; short answer takes the weakest cards first.
 * If one kind runs short, the other fills in. The final order is mixed.
 */
export function pickTest(o: { mc: McPick[]; cards: CardPick[]; n: number; ap: boolean; weakTopics: string[]; rand?: () => number }): TestItem[] {
  const rand = o.rand ?? Math.random;
  const wantSa = Math.round(o.n * shortAnswerShare(o.ap));
  const topicRank = (t: string | null) => {
    const i = t ? o.weakTopics.indexOf(t) : -1;
    return i < 0 ? o.weakTopics.length : i;
  };
  const mcOrder = shuffle(o.mc, rand).sort((a, b) => Number(b.missed) - Number(a.missed) || topicRank(a.topic) - topicRank(b.topic));
  // Weakest first; cards that look the same come in a fresh order each time.
  const saOrder = shuffle(o.cards, rand).sort((a, b) => cardWeakness(b) - cardWeakness(a));

  const sa = Math.min(saOrder.length, Math.max(wantSa, o.n - mcOrder.length));
  const mc = Math.min(mcOrder.length, o.n - sa);
  const items: TestItem[] = [
    ...mcOrder.slice(0, mc).map((q) => ({ kind: "mc" as const, id: q.id })),
    ...saOrder.slice(0, sa).map((c) => ({ kind: "sa" as const, id: c.id })),
  ];
  return shuffle(items, rand);
}

/** Time allowed, in whole minutes. */
export const minutesFor = (items: TestItem[]) => Math.ceil(items.reduce((s, i) => s + (i.kind === "mc" ? MC_SECONDS : SA_SECONDS), 0) / 60);

/** Score out of the number of questions: right 1, partly right a half. Unanswered counts as wrong. */
export function scoreTest(results: { kind: "mc" | "sa"; correct?: boolean; verdict?: SaVerdict | null }[]) {
  const points = results.reduce((s, r) => s + (r.kind === "mc" ? (r.correct ? 1 : 0) : r.verdict === "right" ? 1 : r.verdict === "partly" ? 0.5 : 0), 0);
  const total = results.length;
  return { points, total, pct: total ? Math.round((100 * points) / total) : 0 };
}

/** "12:05" from seconds. */
export const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
