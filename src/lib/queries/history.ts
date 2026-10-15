import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
import type { HistoryRow } from "../history";
import { supabase } from "../supabase";

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** Everything studied per day, class and kind, in the student's time zone. */
export function useStudyHistory(days = 182) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["study-history", session?.user.id, days],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("study_history", { p_days: days, p_tz: tz() });
      if (error) throw error;
      return (data ?? []) as HistoryRow[];
    },
  });
}

export type StudySession = { started_at: string; ended_at: string; subject_ids: string[]; reviews: number; quiz_answers: number; practice_tests: number; tutor: number; correct: number; graded: number };

/** Recent sittings: studying with no gap over 30 minutes counts as one. */
export function useStudySessions(days = 30) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["study-sessions", session?.user.id, days],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("study_sessions", { p_days: days, p_limit: 20 });
      if (error) throw error;
      return (data ?? []) as StudySession[];
    },
  });
}
