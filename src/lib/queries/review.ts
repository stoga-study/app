import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
import { supabase } from "../supabase";
import { endOfToday } from "./cards";

export const CARD_FIELDS =
  "id, subject_id, source_id, front, back, pages, edited, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, sources(kind)";

export type ReviewCard = {
  id: string; subject_id: string; source_id: string | null; front: string; back: string; pages: number[]; edited: boolean;
  due: string; stability: number; difficulty: number; elapsed_days: number; scheduled_days: number; learning_steps: number;
  reps: number; lapses: number; state: number; last_review: string | null; sources: { kind: string } | null;
};

/** Cards due by the end of today, oldest first. */
export function useDueQueue(subjectId: string | null, limit = 60) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["due-queue", session?.user.id, subjectId],
    enabled: !!session,
    staleTime: Infinity,
    queryFn: async () => {
      let q = supabase.from("cards").select(CARD_FIELDS).lte("due", endOfToday().toISOString()).order("due").limit(limit);
      if (subjectId) q = q.eq("subject_id", subjectId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as ReviewCard[];
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
