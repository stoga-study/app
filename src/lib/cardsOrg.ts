// Organising cards: tags, search and automatic grouping (class, then unit, then file). Pure, so tested.
import { byNumber, unitName } from "./units";

export const MAX_TAGS = 20;

/** "#Key Terms " becomes "key terms". Empty or symbol-only input gives null. */
export function normTag(raw: string): string | null {
  const t = raw.trim().replace(/^#+/, "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 30).trim();
  return /[\p{L}\p{N}]/u.test(t) ? t : null;
}

/** "vocab, #Unit 3,, vocab" becomes ["vocab", "unit 3"]. */
export function parseTags(input: string): string[] {
  return [...new Set(input.split(",").map(normTag).filter((t): t is string => !!t))];
}

export const addTag = (tags: string[], t: string) => (tags.includes(t) || tags.length >= MAX_TAGS ? tags : [...tags, t]);
export const removeTag = (tags: string[], t: string) => tags.filter((x) => x !== t);

type Searchable = { front: string; back: string; tags: string[] };

/** Every word must appear in the card or its tags; "#word" must be a tag (the start of one). */
export function matchCard(card: Searchable, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = `${card.front}\n${card.back}`.toLowerCase();
  return words.every((w) => {
    if (w.startsWith("#")) {
      const t = w.slice(1);
      return !t || card.tags.some((x) => x.startsWith(t));
    }
    return text.includes(w) || card.tags.some((x) => x.includes(w));
  });
}

/** Every tag used, most used first, for the filter chips. */
export function tagCounts(cards: { tags: string[] }[]): [string, number][] {
  const n = new Map<string, number>();
  for (const c of cards) for (const t of c.tags) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

type CardLike = { id: string; source_id: string | null };
type SourceLike = { id: string; subject_id: string; filename: string; unit_id: string | null; lesson: string | null; created_at: string };
type UnitLike = { id: string; number: string | null; title: string | null; word?: string | null };

export type CardGroup<C> = { key: string; title: string; files: { key: string; title: string; cards: C[] }[] };

/**
 * A class's cards in teaching order: each unit (by number), then files with no unit, then cards
 * that are not from one of this class's files (made by hand, from the tutor, or moved here).
 */
export function groupCards<C extends CardLike>(cards: C[], sources: SourceLike[], units: UnitLike[], subjectId: string): CardGroup<C>[] {
  const own = new Map(sources.filter((s) => s.subject_id === subjectId).map((s) => [s.id, s]));
  const lesson = (s: SourceLike) => (s.lesson ? Number(s.lesson.split(".")[1]) : Infinity);
  const files = (list: SourceLike[]) =>
    [...list]
      .sort((a, b) => lesson(a) - lesson(b) || a.created_at.localeCompare(b.created_at))
      .map((s) => ({ key: s.id, title: s.filename, cards: cards.filter((c) => c.source_id === s.id) }))
      .filter((f) => f.cards.length);
  const known = new Set(units.map((u) => u.id));
  const out: CardGroup<C>[] = [...units].sort(byNumber).map((u) => ({
    key: u.id,
    title: unitName(u),
    files: files([...own.values()].filter((s) => s.unit_id === u.id)),
  }));
  out.push({ key: "no-unit", title: units.length ? "No unit" : "Files", files: files([...own.values()].filter((s) => !s.unit_id || !known.has(s.unit_id))) });
  const loose = cards.filter((c) => !c.source_id || !own.has(c.source_id));
  if (loose.length) out.push({ key: "loose", title: "Your own cards", files: [{ key: "loose", title: "Made by you, from the tutor, or moved here", cards: loose }] });
  return out.filter((g) => g.files.length);
}
