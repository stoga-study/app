import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
import { supabase } from "../supabase";
import { isWeak, WEAK } from "../fsrs";
import { pendingSchedules } from "../offline/outbox";
import { endOfToday } from "./cards";

export const CARD_FIELDS =
  "id, subject_id, source_id, front, back, pages, edited, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, sources(kind, unit_id)";

export type ReviewCard = {
  id: string; subject_id: string; source_id: string | null; front: string; back: string; pages: number[]; edited: boolean;
  due: string; stability: number; difficulty: number; elapsed_days: number; scheduled_days: number; learning_steps: number;
  reps: number; lapses: number; state: number; last_review: string | null; sources: { kind: string; unit_id: string | null } | null;
};

/** Which cards a session covers: a class, one unit, and how many at most. */
export type ReviewScope = { subjectId?: string | null; unitId?: string | null; size?: number | null; cardIds?: Set<string> | null };

/** Cards reviewed on this device but not sent yet carry their new schedule, not the server's old one. */
async function withPending(cards: ReviewCard[]) {
  const pending = await pendingSchedules();
  return cards.map((c) => (pending.has(c.id) ? { ...c, ...pending.get(c.id)! } : c));
}

/**
 * Every card due by the end of today (up to 400), oldest first. One list serves every session
 * (class, unit, size), so all of them work offline. Checked again each time a session opens.
 */
export function useDueQueue() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["due-queue", session?.user.id],
    enabled: !!session,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.from("cards").select(CARD_FIELDS).lte("due", endOfToday().toISOString()).order("due").limit(400);
      if (error) throw error;
      const cutoff = endOfToday().getTime();
      return (await withPending(data as unknown as ReviewCard[])).filter((c) => new Date(c.due).getTime() <= cutoff);
    },
  });
}

/** The cards one session covers, in order. */
export function inScope(cards: ReviewCard[], s: ReviewScope) {
  const mine = cards.filter(
    (c) => (!s.subjectId || c.subject_id === s.subjectId) && (!s.unitId || c.sources?.unit_id === s.unitId) && (!s.cardIds || s.cardIds.has(c.id)),
  );
  return s.size ? mine.slice(0, s.size) : mine;
}

/**
 * Weak cards (see `isWeak`): forgotten twice or more, or hard for you. Practised any time, not only
 * when due; the most-missed first.
 */
export function useWeakCards() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["weak-cards", session?.user.id],
    enabled: !!session,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cards")
        .select(CARD_FIELDS)
        .neq("state", 0)
        .or(`lapses.gte.${WEAK.lapses},difficulty.gte.${WEAK.difficulty}`)
        .order("lapses", { ascending: false })
        .order("difficulty", { ascending: false })
        .limit(200);
      if (error) throw error;
      // A review waiting on this device may have changed whether a card is still weak.
      return (await withPending(data as unknown as ReviewCard[])).filter(isWeak);
    },
  });
}

export function useNextDue() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["next-due", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("cards").select("due").gt("due", new Date().toISOString()).order("due").limit(1);
      if (error) throw error;
      return data[0]?.due ?? null;
    },
  });
}

export function useEditCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, front, back }: { id: string; front: string; back: string }) => {
      const { error } = await supabase.from("cards").update({ front, back, edited: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["studyset"] }),
  });
}

/** Reviews per day for the last `days` days, for Progress. */
export function useReviewHistory(days = 7) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["review-history", session?.user.id, days],
    enabled: !!session,
    queryFn: async () => {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      since.setDate(since.getDate() - (days - 1));
      const { data, error } = await supabase.from("card_reviews").select("rating, reviewed_at").gte("reviewed_at", since.toISOString());
      if (error) throw error;
      const buckets = Array.from({ length: days }, (_, i) => {
        const d = new Date(since);
        d.setDate(since.getDate() + i);
        return { date: d.toISOString(), count: 0 }; // ISO string: saved for offline use as JSON
      });
      const start = since.getTime();
      for (const r of data) {
        const d = new Date(r.reviewed_at);
        const i = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - start) / 86400000);
        if (i >= 0 && i < days) buckets[i].count++;
      }
      return buckets;
    },
  });
}
