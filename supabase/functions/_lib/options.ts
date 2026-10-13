// What a study set includes, and how much. Shared by the app (upload sheet) and the generate function,
// so both apply the same rules. Pure functions, so they run in unit tests too.

export type Part = "notes" | "cards" | "quiz" | "guide" | "summary" | "terms";
export const PARTS: Part[] = ["notes", "cards", "quiz", "guide", "summary", "terms"];
/** Parts that take a number: how many cards, quiz questions, guide sections or key terms. */
export type Counted = "cards" | "quiz" | "guide" | "terms";
export type Caps = Record<Counted, number>;
export type Amounts = Record<Counted, number>;
/** `focus`: an optional steer for a guide remake ("shorter", "the midterm", a unit name). Guide only. */
export type GenOptions = { parts: Record<Part, boolean>; amounts: Amounts; focus?: string };

export const NONE: Record<Part, boolean> = { notes: false, cards: false, quiz: false, guide: false, summary: false, terms: false };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** A sensible amount for each part from how much text the file has (a 4-page handout vs a 30-page chapter). */
export function suggestAmounts(chars: number, caps: Caps): Amounts {
  return {
    cards: clamp(Math.round(chars / 450), Math.min(5, caps.cards), caps.cards),
    quiz: clamp(Math.round(chars / 1500), Math.min(5, caps.quiz), Math.min(20, caps.quiz)),
    guide: clamp(Math.round(chars / 4000), Math.min(3, caps.guide), Math.min(8, caps.guide)),
    terms: clamp(Math.round(chars / 700), Math.min(5, caps.terms), Math.min(25, caps.terms)),
  };
}

const MAX_FOCUS = 120;

/** Check what a student asked for against their plan's caps. */
export function checkOptions(raw: unknown, caps: Caps): { ok: true; options: GenOptions } | { ok: false; error: "bad_options" | "none_chosen" | "over_cap" } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "bad_options" };
  const r = raw as { parts?: Record<string, unknown>; amounts?: Record<string, unknown>; focus?: unknown };
  const parts = { ...NONE };
  for (const p of PARTS) parts[p] = r.parts?.[p] === true;
  if (!PARTS.some((p) => parts[p])) return { ok: false, error: "none_chosen" };
  const amounts = { cards: 0, quiz: 0, guide: 0, terms: 0 } as Amounts;
  for (const k of ["cards", "quiz", "guide", "terms"] as Counted[]) {
    if (!parts[k]) continue;
    const n = r.amounts?.[k];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1) return { ok: false, error: "bad_options" };
    if (n > caps[k]) return { ok: false, error: "over_cap" };
    amounts[k] = n;
  }
  const focus = typeof r.focus === "string" ? r.focus.trim().slice(0, MAX_FOCUS) : "";
  return { ok: true, options: focus ? { parts, amounts, focus } : { parts, amounts } };
}

/** A stable name for a set of options, so shared study sets only match identical requests. */
export function optionsKey(o: GenOptions): string {
  const base = PARTS.map((p) => (o.parts[p] ? `${p[0]}${p === "notes" || p === "summary" ? "" : o.amounts[p as Counted]}` : "")).join("") || "none";
  // The focus text itself is part of the key, so two different focuses (or none) never match each other.
  return o.focus ? `${base}+f:${o.focus.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 40)}` : base;
}

/**
 * Split a total (e.g. 40 flashcards) across page chunks in proportion to how much text each has.
 * Largest remainders, so the parts always add up to the total.
 */
export function splitAcross(total: number, weights: number[]): number[] {
  if (!weights.length) return [];
  // No text anywhere: split evenly.
  const w = weights.some((x) => x > 0) ? weights.map((x) => Math.max(0, x)) : weights.map(() => 1);
  const sum = w.reduce((a, b) => a + b, 0);
  const raw = w.map((x) => (total * x) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}

export type Task = { kind: "notes" | "cards"; part: number } | { kind: "quiz" | "guide" | "summary" | "terms" };

/** The jobs for one run: notes and cards go chunk by chunk; the rest are one job each. */
export function planTasks(chunks: number, parts: Record<Part, boolean>): Task[] {
  return [
    ...(parts.notes ? Array.from({ length: chunks }, (_, part) => ({ kind: "notes" as const, part })) : []),
    ...(parts.cards ? Array.from({ length: chunks }, (_, part) => ({ kind: "cards" as const, part })) : []),
    ...(parts.quiz ? [{ kind: "quiz" as const }] : []),
    ...(parts.guide ? [{ kind: "guide" as const }] : []),
    ...(parts.summary ? [{ kind: "summary" as const }] : []),
    ...(parts.terms ? [{ kind: "terms" as const }] : []),
  ];
}
