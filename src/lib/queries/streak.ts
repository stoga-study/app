import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
import { today } from "../calendar";
import { weekOf } from "../goals";
import { dayTotals } from "../history";
import { weekStart } from "../locale";
import { streak } from "../streak";
import { supabase } from "../supabase";
import { useStudyHistory } from "./history";
import { useProfile } from "./profile";

/** The student's streak, when they have turned streaks on. */
export function useStreak() {
  const profile = useProfile();
  const history = useStudyHistory(182);
  const target = profile.data?.streak_days ?? null;
  if (!profile.data || !history.data) return { ready: false as const, on: false, target, state: null, pauses: [] as string[] };
  const studied = new Set([...dayTotals(history.data)].filter(([, t]) => t.activity > 0).map(([d]) => d));
  const pauses = profile.data.streak_pauses ?? [];
  return {
    ready: true as const,
    on: target != null,
    target,
    pauses,
    state: target != null ? streak({ studied, today: today(), firstDay: weekStart(), target, pauses }) : null,
  };
}

export function useStreakSettings() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { streak_days?: number | null; streak_pauses?: string[] }) => {
      const { error } = await supabase.from("profiles").update(patch).eq("user_id", session!.user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
}

/** This week's start, the key a pause is stored under. */
export const thisWeekStart = () => weekOf(today(), weekStart()).start;
