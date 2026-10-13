import { Check, CheckSquare, FolderInput, Layers, Search, Tag, Trash2, X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { MathText } from "@/components/MathText";
import { Button } from "@/components/ui/button";
import { addTag, matchCard, normTag, parseTags, removeTag, tagCounts, type CardGroup } from "@/lib/cardsOrg";
import { useDeckLinks, useDecks, useOrganise, type OrgCard } from "@/lib/queries/organise";
import { useSubjects } from "@/lib/queries/profile";

type Panel = "tag" | "deck" | "move" | "delete" | null;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const fail = () => toast("That did not save. Check your connection, then try again.");

/** Front, back and tags. Used to edit a card and to make a new one. */
export function CardForm({
  initial, onSave, onCancel, onDelete, extra, saveLabel = "Save card",
}: {
  initial?: { front: string; back: string; tags: string[] };
  onSave: (v: { front: string; back: string; tags: string[] }) => Promise<unknown>;
  onCancel: () => void;
  onDelete?: () => void;
  extra?: ReactNode;
  saveLabel?: string;
}) {
  const [front, setFront] = useState(initial?.front ?? "");
  const [back, setBack] = useState(initial?.back ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagText, setTagText] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();
  const commitTag = () => {
    const more = parseTags(tagText);
    if (more.length) setTags((t) => more.reduce(addTag, t));
    setTagText("");
  };
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = front.trim(), b = back.trim();
        if (!f || !b) return;
        setBusy(true);
        try {
          await onSave({ front: f.slice(0, 1000), back: b.slice(0, 2000), tags: parseTags(tagText).reduce(addTag, tags) });
        } catch {
          fail();
        } finally {
          setBusy(false);
        }
      }}
    >
      {extra}
      <label htmlFor={`f-${id}`} className="field-label">Question</label>
      <textarea id={`f-${id}`} className="input" maxLength={1000} required value={front} onChange={(e) => setFront(e.target.value)} />
      <label htmlFor={`b-${id}`} className="field-label">Answer</label>
      <textarea id={`b-${id}`} className="input" maxLength={2000} required value={back} onChange={(e) => setBack(e.target.value)} />
      <label htmlFor={`t-${id}`} className="field-label">Tags</label>
      <div className="flex flex-wrap items-center gap-2">
        {tags.map((t) => (
          <button key={t} type="button" className="chip" aria-label={`Remove tag ${t}`} onClick={() => setTags((x) => removeTag(x, t))}>#{t} <X className="size-3.5" /></button>
        ))}
        <input
          id={`t-${id}`}
          className="input !min-h-10 min-w-40 flex-1"
          placeholder="Add a tag, then Enter"
          value={tagText}
          onChange={(e) => setTagText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commitTag();
            }
          }}
          onBlur={commitTag}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !front.trim() || !back.trim()}>{busy ? "Saving…" : saveLabel}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        {onDelete && <Button type="button" variant="ghost" className="ml-auto" onClick={onDelete}><Trash2 /> Delete card</Button>}
      </div>
    </form>
  );
}

/**
 * Browse cards: search (words or #tags), tag chips, tap a card to edit it, and Select for bulk
 * actions (tag, add to a deck, move to another class, remove from this deck, delete).
 */
export function CardBrowser({ cards, groups, subjectId, deckId, initialQuery, empty }: {
  cards: OrgCard[];
  /** A class's cards by unit and file. Without it, a flat list (a deck). */
  groups?: CardGroup<OrgCard>[];
  /** Browsing a class: offers Move to another class. */
  subjectId?: string;
  /** Browsing a deck: offers Remove from this deck. */
  deckId?: string;
  /** Arriving from search, with a term already in mind. */
  initialQuery?: string;
  empty: ReactNode;
}) {
  const org = useOrganise();
  const decks = useDecks();
  const links = useDeckLinks();
  const subjects = useSubjects();
  const [query, setQuery] = useState(initialQuery ?? "");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);

  const shown = (c: OrgCard) => matchCard(c, query) && (!tagFilter || c.tags.includes(tagFilter));
  const visible = cards.filter(shown);
  const tags = tagCounts(cards);
  const deckName = (id: string) => decks.data?.find((d) => d.id === id)?.name;
  const ids = [...selected].filter((id) => cards.some((c) => c.id === id));

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
    setPanel(null);
  };
  async function act(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast(done);
      stopSelecting();
    } catch {
      fail();
    } finally {
      setBusy(false);
    }
  }

  if (!cards.length) return <>{empty}</>;

  const row = (c: OrgCard) => {
    const on = selected.has(c.id);
    const inDecks = (links.data?.[c.id] ?? []).filter((d) => d !== deckId).map(deckName).filter(Boolean);
    return (
      <li key={c.id} className={`card !shadow-none p-4 ${on ? "!border-primary" : ""}`}>
        {openId === c.id && !selecting ? (
          <CardForm
            initial={c}
            onCancel={() => setOpenId(null)}
            onSave={async (v) => { await org.edit(c.id, v); setOpenId(null); toast("Card saved."); }}
            onDelete={() => void act(() => org.remove([c.id]), "Card deleted.")}
          />
        ) : (
          <button
            type="button"
            className="flex w-full items-start gap-3 text-left"
            aria-pressed={selecting ? on : undefined}
            onClick={() => (selecting ? toggle(c.id) : setOpenId(c.id))}
          >
            {selecting && (
              <span className={`mt-0.5 grid size-6 flex-none place-items-center rounded-md border-2 ${on ? "border-primary bg-primary text-white" : "border-line-strong"}`} aria-hidden="true">
                {on && <Check className="size-3.5" />}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block font-bold"><MathText text={c.front} /></span>
              <span className="mt-0.5 line-clamp-2 block text-[0.9375rem] text-muted"><MathText text={c.back} /></span>
              {(c.tags.length > 0 || inDecks.length > 0) && (
                <span className="mt-2 flex flex-wrap gap-1.5 text-[0.8125rem]">
                  {c.tags.map((t) => <span key={t} className="rounded-full bg-soft px-2 py-0.5 font-bold text-ink-2">#{t}</span>)}
                  {inDecks.map((n) => <span key={n} className="rounded-full border border-line px-2 py-0.5 text-muted"><Layers className="mr-1 inline size-3" />{n}</span>)}
                </span>
              )}
            </span>
          </button>
        )}
      </li>
    );
  };

  const filtered = !!query.trim() || !!tagFilter;
  const shownGroups = groups
    ?.map((g) => ({ ...g, files: g.files.map((f) => ({ ...f, cards: f.cards.filter(shown) })).filter((f) => f.cards.length) }))
    .filter((g) => g.files.length);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">Search cards</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input className="input !pl-10" type="search" placeholder="Search, or #tag" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {selecting ? (
          <Button variant="secondary" onClick={stopSelecting}><X /> Done</Button>
        ) : (
          <Button variant="secondary" onClick={() => { setSelecting(true); setOpenId(null); }}><CheckSquare /> Select</Button>
        )}
      </div>
      {tags.length > 0 && (
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:px-0" role="radiogroup" aria-label="Filter by tag">
          {tags.slice(0, 30).map(([t, n]) => (
            <button key={t} type="button" role="radio" aria-checked={tagFilter === t} className="pill-option flex-none !min-h-9" onClick={() => setTagFilter((x) => (x === t ? null : t))}>
              {tagFilter === t && <Check />}#{t} <span className="font-normal text-muted">{n}</span>
            </button>
          ))}
        </div>
      )}
      {filtered && <p className="text-[0.9375rem] text-muted" aria-live="polite">{plural(visible.length, "card")} match.</p>}

      {visible.length === 0 ? (
        <p className="callout neutral">No cards match. Try fewer words, or clear the tag.</p>
      ) : shownGroups ? (
        <div className="flex flex-col gap-6">
          {shownGroups.map((g) => (
            <section key={g.key} aria-label={g.title} className="flex flex-col gap-3">
              <h2 className="text-[1.25rem]">{g.title}</h2>
              {g.files.map((f) => (
                <div key={f.key} className="flex flex-col gap-2">
                  <h3 className="text-[0.9375rem] font-bold text-muted">{f.title} · {plural(f.cards.length, "card")}</h3>
                  <ul className="flex flex-col gap-2">{f.cards.map(row)}</ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">{visible.map(row)}</ul>
      )}

      {selecting && (
        <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-20 lg:bottom-4">
          <div className="card flex flex-col gap-3 p-4 shadow-lg" role="region" aria-label="Selected cards">
            <div className="flex flex-wrap items-center gap-2">
              <b className="tabular">{ids.length} selected</b>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(visible.map((c) => c.id)))}>Select all {visible.length}</Button>
              {ids.length > 0 && <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>}
            </div>
            {ids.length > 0 && (
              <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Actions">
                <Button size="sm" variant={panel === "tag" ? "primary" : "secondary"} onClick={() => setPanel((p) => (p === "tag" ? null : "tag"))}><Tag /> Tag</Button>
                <Button size="sm" variant={panel === "deck" ? "primary" : "secondary"} onClick={() => setPanel((p) => (p === "deck" ? null : "deck"))}><Layers /> Add to deck</Button>
                {subjectId && <Button size="sm" variant={panel === "move" ? "primary" : "secondary"} onClick={() => setPanel((p) => (p === "move" ? null : "move"))}><FolderInput /> Move</Button>}
                {deckId && <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => org.removeFromDeck(ids, deckId), `${plural(ids.length, "card")} removed from this deck.`)}><X /> Remove from deck</Button>}
                <Button size="sm" variant={panel === "delete" ? "primary" : "ghost"} onClick={() => setPanel((p) => (p === "delete" ? null : "delete"))}><Trash2 /> Delete</Button>
              </div>
            )}
            {ids.length > 0 && panel === "tag" && <TagPanel cards={cards.filter((c) => selected.has(c.id))} busy={busy} onAdd={(t) => act(() => org.tag(ids, t), `Tagged ${plural(ids.length, "card")} #${t}.`)} onRemove={(t) => act(() => org.untag(ids, t), `Removed #${t}.`)} />}
            {ids.length > 0 && panel === "deck" && (
              <DeckPanel
                decks={(decks.data ?? []).filter((d) => d.id !== deckId)}
                busy={busy}
                onPick={(id, name) => act(() => org.addToDeck(ids, id), `Added ${plural(ids.length, "card")} to ${name}.`)}
                onNew={(name) => act(async () => org.addToDeck(ids, await org.createDeck(name)), `Made ${name} with ${plural(ids.length, "card")}.`)}
              />
            )}
            {ids.length > 0 && panel === "move" && (
              <div className="flex flex-wrap gap-2" aria-label="Move to class">
                {(subjects.data ?? []).filter((s) => s.id !== subjectId).map((s) => (
                  <button key={s.id} type="button" className="pill-option" disabled={busy} onClick={() => act(() => org.move(ids, s.id), `Moved ${plural(ids.length, "card")} to ${s.name}.`)}>{s.name}</button>
                ))}
                {(subjects.data ?? []).length < 2 && <p className="text-muted">You have no other classes to move them to.</p>}
              </div>
            )}
            {ids.length > 0 && panel === "delete" && (
              <div role="alert" className="flex flex-wrap items-center gap-3">
                <p className="flex-1">Delete {plural(ids.length, "card")} and their review history? This cannot be undone.</p>
                <Button size="sm" disabled={busy} onClick={() => act(() => org.remove(ids), `${plural(ids.length, "card")} deleted.`)}>Delete</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TagPanel({ cards, busy, onAdd, onRemove }: { cards: OrgCard[]; busy: boolean; onAdd: (t: string) => void; onRemove: (t: string) => void }) {
  const [text, setText] = useState("");
  const onThem = tagCounts(cards);
  return (
    <div className="flex flex-col gap-2">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = normTag(text); if (t) onAdd(t); }}>
        <label htmlFor="bulk-tag" className="sr-only">Tag</label>
        <input id="bulk-tag" className="input !min-h-10 flex-1" placeholder="e.g. vocab" maxLength={40} value={text} onChange={(e) => setText(e.target.value)} />
        <Button size="sm" type="submit" disabled={busy || !normTag(text)}>Add tag</Button>
      </form>
      {onThem.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {onThem.map(([t]) => <button key={t} type="button" className="chip" disabled={busy} onClick={() => onRemove(t)}>Remove #{t} <X className="size-3.5" /></button>)}
        </div>
      )}
    </div>
  );
}

function DeckPanel({ decks, busy, onPick, onNew }: { decks: { id: string; name: string }[]; busy: boolean; onPick: (id: string, name: string) => void; onNew: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="flex flex-col gap-2">
      {decks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {decks.map((d) => <button key={d.id} type="button" className="pill-option" disabled={busy} onClick={() => onPick(d.id, d.name)}><Layers />{d.name}</button>)}
        </div>
      )}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onNew(name.trim()); }}>
        <label htmlFor="new-deck" className="sr-only">New deck name</label>
        <input id="new-deck" className="input !min-h-10 flex-1" placeholder="New deck, e.g. Midterm review" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <Button size="sm" type="submit" disabled={busy || !name.trim()}>Make deck</Button>
      </form>
    </div>
  );
}
