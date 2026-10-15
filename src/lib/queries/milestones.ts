import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
import { today } from "../calendar";
import { dayTotals } from "../history";
import { weekStart } from "../locale";
import { milestones, newlyReached } from "../milestones";
import { supabase } from "../supabase";
import { useStudyHistory } from "./history";
import { useMastery } from "./mastery";
import { useProfile } from "./profile";
import { useAllUnits } from "./units";

/** The counts milestones are measured from. */
function useCounts() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["milestone-counts", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const head = { count: "exact" as const, head: true };
      const [reviewed, learned, tests, attempts, notes] = await Promise.all([
        supabase.from("card_reviews").select("id", head),
        supabase.from("cards").select("id", head).eq("state", 2).eq("hidden", false),
        supabase.from("practice_tests").select("pct").order("pct", { ascending: false }).limit(1000),
        supabase.from("quiz_attempts").select("correct, total").gte("total", 5).not("finished_at", "is", null).limit(1000),
        supabase.from("student_notes").select("id", head),
      ]);
      return {
        cardsReviewed: reviewed.count ?? 0,
        cardsLearned: learned.count ?? 0,
        practiceTests: tests.data?.length ?? 0,
        bestPracticeTest: tests.data?.[0]?.pct ?? null,
        perfectQuizzes: (attempts.data ?? []).filter((a) => a.correct === a.total).length,
        ownNotes: notes.count ?? 0,
      };
    },
  });
}

export function useMilestones() {
  const profile = useProfile();
  const history = useStudyHistory(400);
  const counts = useCounts();
  const mastery = useMastery();
  const units = useAllUnits();
  if (!profile.data || !history.data || !counts.data || !mastery.ready || !units.data) return { ready: false as const, all: [], fresh: [], seen: {} as Record<string, string> };
  const studied = new Set([...dayTotals(history.data)].filter(([, t]) => t.activity > 0).map(([d]) => d));
  const unitsMastered = units.data.filter((u) => mastery.forUnit(u.id)?.label === "Mastered").length;
  const all = milestones({ studied, today: today(), firstDay: weekStart(), unitsMastered, ...counts.data });
  const seen = (profile.data.milestones ?? {}) as Record<string, string>;
  return { ready: true as const, all, fresh: newlyReached(all, seen), seen };
}

/** Note milestones as seen today (closing the Home card notes every new one at once, so there is never a pile-up). */
export function useMarkMilestones() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, seen }: { ids: string[]; seen: Record<string, string> }) => {
      const next = { ...seen, ...Object.fromEntries(ids.map((id) => [id, today()])) };
      const { error } = await supabase.from("profiles").update({ milestones: next }).eq("user_id", session!.user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
}
