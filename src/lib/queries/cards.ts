import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
import { supabase } from "../supabase";

/** Roughly how long a review takes, for "About 10 minutes" estimates. */
export const SECONDS_PER_CARD = 25;

/** End of today in the student's own time zone: cards due before then count as due today. */
export function endOfToday(now = new Date()) {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Cards due today, by subject, plus when the next card after today is due. */
export function useDueCards() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["due-cards", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const cutoff = endOfToday().toISOString();
      const [due, next, total] = await Promise.all([
        supabase.from("cards").select("subject_id").lte("due", cutoff),
        supabase.from("cards").select("due").gt("due", cutoff).order("due").limit(1),
        supabase.from("cards").select("id", { count: "exact", head: true }),
      ]);
      for (const r of [due, next, total]) if (r.error) throw r.error;
      // Plain object, not a Map: this result is saved for offline use as JSON.
      const bySubject: Record<string, number> = {};
      for (const c of due.data!) bySubject[c.subject_id] = (bySubject[c.subject_id] ?? 0) + 1;
      return { count: due.data!.length, bySubject, nextDue: next.data![0]?.due ?? null, total: total.count ?? 0 };
    },
  });
}

/** "About 10 minutes" (never "0 minutes"). */
export function reviewMinutes(cards: number) {
  const m = Math.max(1, Math.round((cards * SECONDS_PER_CARD) / 60));
  return `About ${m} ${m === 1 ? "minute" : "minutes"}`;
}

/** "AP Statistics and Chemistry 1", "AP Statistics, Chemistry 1 and 1 more". */
export function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}
