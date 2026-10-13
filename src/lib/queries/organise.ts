import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
import { supabase } from "../supabase";

// Browsing and organising cards: a class's cards, custom decks, tags and bulk actions.

const FIELDS = "id, subject_id, source_id, front, back, pages, tags, state, due, lapses, difficulty, edited, created_at";
export type OrgCard = {
  id: string; subject_id: string; source_id: string | null; front: string; back: string; pages: number[]; tags: string[];
  state: number; due: string; lapses: number; difficulty: number; edited: boolean; created_at: string;
};
export type Deck = { id: string; name: string; created_at: string; count: number };

/** Every card in a class, oldest first. */
export function useClassCards(subjectId: string | undefined) {
  return useQuery({
    queryKey: ["class-cards", subjectId],
    enabled: !!subjectId,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.from("cards").select(FIELDS).eq("subject_id", subjectId!).order("created_at").limit(5000);
      if (error) throw error;
      return data as OrgCard[];
    },
  });
}

export function useDecks() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["decks", session?.user.id],
    enabled: !!session,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.from("decks").select("id, name, created_at, deck_cards(count)").order("created_at");
      if (error) throw error;
      return data.map((d) => ({ id: d.id, name: d.name, created_at: d.created_at, count: (d.deck_cards as unknown as { count: number }[])[0]?.count ?? 0 })) as Deck[];
    },
  });
}

/** One deck and its cards (from any class). */
export function useDeck(id: string | undefined) {
  return useQuery({
    queryKey: ["deck", id],
    enabled: !!id,
    refetchOnMount: "always",
    queryFn: async () => {
      const [deck, links] = await Promise.all([
        supabase.from("decks").select("id, name, created_at").eq("id", id!).maybeSingle(),
        supabase.from("deck_cards").select(`added_at, cards(${FIELDS})`).eq("deck_id", id!).order("added_at").limit(5000),
      ]);
      if (deck.error) throw deck.error;
      if (links.error) throw links.error;
      if (!deck.data) return null;
      return { ...deck.data, cards: links.data.map((l) => l.cards as unknown as OrgCard).filter(Boolean) };
    },
  });
}

/** Which decks each card is in (all of the student's links; small). */
export function useDeckLinks() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["deck-links", session?.user.id],
    enabled: !!session,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.from("deck_cards").select("deck_id, card_id").limit(20000);
      if (error) throw error;
      const byCard: Record<string, string[]> = {};
      for (const l of data) (byCard[l.card_id] ??= []).push(l.deck_id);
      return byCard;
    },
  });
}

/** Long id lists go in pieces, so no request gets too big. */
async function inChunks(ids: string[], fn: (part: string[]) => PromiseLike<{ error: unknown }>) {
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await fn(ids.slice(i, i + 100));
    if (error) throw error;
  }
}

/** Bulk actions and deck changes. Each refreshes every list a card can show up in. */
export function useOrganise() {
  const qc = useQueryClient();
  const refresh = async () => {
    await Promise.all(
      ["class-cards", "decks", "deck", "deck-links", "due-cards", "due-queue", "weak-cards", "studyset"].map((k) => qc.invalidateQueries({ queryKey: [k] })),
    );
  };
  const run = <A extends unknown[]>(fn: (...a: A) => Promise<unknown>) => async (...a: A) => {
    try {
      return await fn(...a);
    } finally {
      await refresh();
    }
  };
  return {
    tag: run((ids: string[], tag: string) => inChunks(ids, (part) => supabase.rpc("tag_cards", { card_ids: part, tag }))),
    untag: run((ids: string[], tag: string) => inChunks(ids, (part) => supabase.rpc("untag_cards", { card_ids: part, tag }))),
    addToDeck: run((ids: string[], deckId: string) =>
      inChunks(ids, (part) => supabase.from("deck_cards").upsert(part.map((card_id) => ({ deck_id: deckId, card_id })), { onConflict: "deck_id,card_id", ignoreDuplicates: true })),
    ),
    removeFromDeck: run((ids: string[], deckId: string) => inChunks(ids, (part) => supabase.from("deck_cards").delete().eq("deck_id", deckId).in("card_id", part))),
    /** Cards keep their file link (and page chips); they are listed under "Your own cards" in the new class. */
    move: run((ids: string[], subjectId: string) => inChunks(ids, (part) => supabase.from("cards").update({ subject_id: subjectId }).in("id", part))),
    remove: run((ids: string[]) => inChunks(ids, (part) => supabase.from("cards").delete().in("id", part))),
    edit: run(async (id: string, v: { front: string; back: string; tags: string[] }) => {
      const { error } = await supabase.from("cards").update({ ...v, edited: true }).eq("id", id);
      if (error) throw error;
    }),
    create: run(async (v: { subjectId: string; front: string; back: string; tags: string[]; deckId?: string | null }) => {
      const { data, error } = await supabase.from("cards").insert({ subject_id: v.subjectId, front: v.front, back: v.back, tags: v.tags, edited: true }).select("id").single();
      if (error) throw error;
      if (v.deckId) {
        const { error: e2 } = await supabase.from("deck_cards").insert({ deck_id: v.deckId, card_id: data.id });
        if (e2) throw e2;
      }
      return data.id;
    }),
    createDeck: run(async (name: string) => {
      const { data, error } = await supabase.from("decks").insert({ name: name.trim().slice(0, 60) }).select("id").single();
      if (error) throw error;
      return data.id as string;
    }),
    renameDeck: run(async (id: string, name: string) => {
      const { error } = await supabase.from("decks").update({ name: name.trim().slice(0, 60) }).eq("id", id);
      if (error) throw error;
    }),
    /** Deleting a deck keeps its cards; they stay in their classes. */
    deleteDeck: run(async (id: string) => {
      const { error } = await supabase.from("decks").delete().eq("id", id);
      if (error) throw error;
    }),
    mergeDecks: run(async (from: string, into: string) => {
      const { error } = await supabase.rpc("merge_decks", { from_deck: from, into_deck: into });
      if (error) throw error;
    }),
  };
}
