import { ArrowLeft, Check, Layers, Merge, Pencil, PenLine, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { CardBrowser, CardForm } from "@/components/CardBrowser";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { groupCards } from "@/lib/cardsOrg";
import { endOfToday } from "@/lib/queries/cards";
import { useClassCards, useDeck, useDecks, useOrganise, type OrgCard } from "@/lib/queries/organise";
import { useSessionSize } from "@/lib/preferences";
import { useAllSubjects, useSubjects } from "@/lib/queries/profile";
import { useSources } from "@/lib/queries/sources";
import { useUnits } from "@/lib/queries/units";

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
const dueNow = (cards: OrgCard[]) => cards.filter((c) => new Date(c.due) <= endOfToday()).length;

/** /subjects/:id/cards: every card in a class, by unit and file. */
export function ClassCards() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const subjects = useAllSubjects();
  const cards = useClassCards(id);
  const sources = useSources();
  const units = useUnits(id);
  const org = useOrganise();
  const [size] = useSessionSize();
  const [adding, setAdding] = useState(false);
  if (subjects.isPending || cards.isPending) return <PageSkeleton label="Getting your cards." />;
  const subject = subjects.data?.find((s) => s.id === id);
  if (!subject) return <ErrorState title="We could not find that class">It may have been removed. <Link to="/subjects">See your subjects</Link>.</ErrorState>;
  if (cards.isError) return <ErrorState title="We could not load your cards" onRetry={() => cards.refetch()}>Check your connection, then try again.</ErrorState>;
  const list = cards.data ?? [];
  const due = dueNow(list);

  return (
    <>
      <Link to={`/subjects/${subject.id}`} className="mb-4 inline-flex min-h-11 items-center gap-2 font-bold text-ink-2 no-underline">
        <ArrowLeft className="size-5" /> {subject.name}
      </Link>
      <PageHeader
        eyebrow={subject.name}
        title="Flashcards"
        end={
          <div className="flex flex-wrap gap-2">
            {due > 0 && <Button asChild><Link to={`/review/session?subject=${subject.id}&size=${size}`}><Play /> Review {due} due</Link></Button>}
            {list.length > 0 && <Button asChild variant="secondary"><Link to={`/practice?subject=${subject.id}`}><PenLine /> Type answers</Link></Button>}
            <Button variant="secondary" onClick={() => setAdding(true)}><Plus /> New card</Button>
          </div>
        }
      >
        {plural(list.length, "card")}. Tap one to edit it, or Select to tag, add to a deck, move or delete several.
      </PageHeader>
      {adding && (
        <div className="card mb-6 p-5">
          <h2 className="mb-3 text-[1.25rem]">New card in {subject.name}</h2>
          <CardForm
            saveLabel="Add card"
            onCancel={() => setAdding(false)}
            onSave={async (v) => { await org.create({ subjectId: subject.id, ...v }); toast("Card added. It is due today."); setAdding(false); }}
          />
        </div>
      )}
      <CardBrowser
        cards={list}
        groups={groupCards(list, sources.data ?? [], units.data ?? [], subject.id)}
        subjectId={subject.id}
        initialQuery={params.get("q") ?? undefined}
        empty={
          <EmptyState icon={<Layers />} title="No cards here yet" action={<Button onClick={() => setAdding(true)}><Plus /> Make a card</Button>}>
            Make flashcards from a file in this class, add them from the tutor, or write your own.
          </EmptyState>
        }
      />
    </>
  );
}

/** /decks: your custom decks. */
export function Decks() {
  const decks = useDecks();
  const org = useOrganise();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageHeader title="Decks">Your own mix of cards, from any class. Review a deck when it is due, or practise it any time.</PageHeader>
      <form
        className="card mb-6 flex flex-wrap items-end gap-2 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          try {
            navigate(`/decks/${await org.createDeck(name)}`);
          } catch {
            toast("We could not make the deck. Check your connection, then try again.");
            setBusy(false);
          }
        }}
      >
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <label htmlFor="deck-name" className="field-label">New deck</label>
          <input id="deck-name" className="input" placeholder="e.g. Midterm review" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button type="submit" disabled={busy || !name.trim()}><Plus /> Make deck</Button>
      </form>
      {decks.isPending ? <PageSkeleton /> : !decks.data?.length ? (
        <EmptyState icon={<Layers />} title="No decks yet">
          Make one above, or open a class&apos;s flashcards, tap Select, and choose Add to deck.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {decks.data.map((d) => (
            <li key={d.id}>
              <Link to={`/decks/${d.id}`} className="card flex items-center gap-4 p-5 text-ink no-underline">
                <span className="tile soft"><Layers /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[1.125rem] font-bold">{d.name}</span>
                  <span className="block text-[0.875rem] text-muted">{plural(d.count, "card")}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** /decks/:id: one deck. Fresh for each deck, so nothing open on one (like Merge) carries to the next. */
export function DeckPage() {
  const { id } = useParams();
  return <DeckView key={id} id={id} />;
}

/** Review a deck, add or edit cards, rename, merge or delete it. */
function DeckView({ id }: { id: string | undefined }) {
  const deck = useDeck(id);
  const decks = useDecks();
  const subjects = useSubjects();
  const org = useOrganise();
  const navigate = useNavigate();
  const [size] = useSessionSize();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addTo, setAddTo] = useState<string | null>(null);
  const [panel, setPanel] = useState<"merge" | "delete" | null>(null);
  if (deck.isPending) return <PageSkeleton label="Opening your deck." />;
  if (deck.isError) return <ErrorState title="We could not open this deck" onRetry={() => deck.refetch()}>Check your connection, then try again.</ErrorState>;
  if (!deck.data) return <ErrorState title="This deck is not here anymore">It may have been deleted or merged. <Link to="/decks">See your decks</Link>.</ErrorState>;
  const d = deck.data;
  const due = dueNow(d.cards);
  const others = (decks.data ?? []).filter((x) => x.id !== d.id);
  const classId = addTo ?? subjects.data?.[0]?.id ?? null;
  const fail = () => toast("That did not save. Check your connection, then try again.");

  return (
    <>
      <Link to="/decks" className="mb-4 inline-flex min-h-11 items-center gap-2 font-bold text-ink-2 no-underline">
        <ArrowLeft className="size-5" /> Decks
      </Link>
      {renaming === null ? (
        <PageHeader
          eyebrow="Deck"
          title={d.name}
          end={<Button variant="ghost" size="sm" onClick={() => setRenaming(d.name)}><Pencil /> Rename</Button>}
        >
          {plural(d.cards.length, "card")}{due ? `, ${due} due today` : ""}.
        </PageHeader>
      ) : (
        <form
          className="mb-6 flex max-w-lg gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!renaming.trim()) return;
            org.renameDeck(d.id, renaming).then(() => setRenaming(null), fail);
          }}
        >
          <label htmlFor="rename-deck" className="sr-only">Deck name</label>
          <input id="rename-deck" autoFocus className="input flex-1" maxLength={60} value={renaming} onChange={(e) => setRenaming(e.target.value)} />
          <Button type="submit" aria-label="Save name"><Check /></Button>
        </form>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {due > 0 && <Button asChild><Link to={`/review/session?deck=${d.id}&size=${size}`}><Play /> Review {due} due</Link></Button>}
        {d.cards.length > 0 && <Button asChild variant={due ? "secondary" : "primary"}><Link to={`/review/session?deck=${d.id}&mode=all&size=${size}`}><Play /> Practise all</Link></Button>}
        {d.cards.length > 0 && <Button asChild variant="secondary"><Link to={`/practice?deck=${d.id}`}><PenLine /> Type answers</Link></Button>}
        <Button variant="secondary" onClick={() => setAdding(true)}><Plus /> New card</Button>
        {others.length > 0 && <Button variant="ghost" onClick={() => setPanel((p) => (p === "merge" ? null : "merge"))}><Merge /> Merge</Button>}
        <Button variant="ghost" onClick={() => setPanel((p) => (p === "delete" ? null : "delete"))}><Trash2 /> Delete deck</Button>
      </div>

      {panel === "merge" && (
        <div className="card mb-6 flex flex-col gap-3 p-5">
          <p className="font-bold">Merge {d.name} into another deck</p>
          <p className="text-[0.9375rem] text-muted">Its cards join that deck, and this deck goes away. Cards are never deleted.</p>
          <div className="flex flex-wrap gap-2">
            {others.map((o) => (
              <button
                key={o.id}
                type="button"
                className="pill-option"
                onClick={() => org.mergeDecks(d.id, o.id).then(() => { toast(`Merged into ${o.name}.`); navigate(`/decks/${o.id}`, { replace: true }); }, fail)}
              >
                <Layers />{o.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {panel === "delete" && (
        <div role="alert" className="card mb-6 flex flex-wrap items-center gap-3 p-5">
          <p className="flex-1">Delete the deck {d.name}? Its cards stay in their classes.</p>
          <Button variant="secondary" size="sm" onClick={() => setPanel(null)}>Keep it</Button>
          <Button size="sm" onClick={() => org.deleteDeck(d.id).then(() => { toast("Deck deleted. Its cards are still in their classes."); navigate("/decks", { replace: true }); }, fail)}>Delete deck</Button>
        </div>
      )}
      {adding && (
        <div className="card mb-6 p-5">
          <h2 className="mb-3 text-[1.25rem]">New card in {d.name}</h2>
          {classId ? (
            <CardForm
              saveLabel="Add card"
              extra={
                <div className="flex flex-col gap-1.5">
                  <span className="field-label">Class</span>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Class">
                    {subjects.data?.map((s) => (
                      <button key={s.id} type="button" role="radio" aria-checked={s.id === classId} className="pill-option" onClick={() => setAddTo(s.id)}>
                        {s.id === classId && <Check />}{s.name}
                      </button>
                    ))}
                  </div>
                </div>
              }
              onCancel={() => setAdding(false)}
              onSave={async (v) => { await org.create({ subjectId: classId, deckId: d.id, ...v }); toast("Card added. It is due today."); setAdding(false); }}
            />
          ) : (
            <p className="text-muted">Add a class first, so the card has a home.</p>
          )}
        </div>
      )}
      <CardBrowser
        cards={d.cards}
        deckId={d.id}
        empty={
          <EmptyState icon={<Layers />} title="This deck is empty">
            Add a new card above, or open a class&apos;s flashcards, tap Select, and choose Add to deck.
          </EmptyState>
        }
      />
    </>
  );
}
