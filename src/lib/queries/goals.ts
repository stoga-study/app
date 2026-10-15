import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
import { addDays, isoDate, today } from "../calendar";
import { goalProgress, weekOf, weeklyRecap, type Goal, type GoalKind, type Session } from "../goals";
import { weekStart } from "../locale";
import { supabase } from "../supabase";
import { useStudyHistory, useStudySessions } from "./history";

/** Goals, and the days each custom goal was ticked in the last three weeks. */
export function useGoalList() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["goals", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const [goals, ticks] = await Promise.all([
        supabase.from("goals").select("id, kind, target, label, subject_id").order("created_at"),
        supabase.from("goal_ticks").select("id, goal_id, day").gte("day", addDays(today(), -21)).order("created_at"),
      ]);
      if (goals.error) throw goals.error;
      if (ticks.error) throw ticks.error;
      const byGoal: Record<string, { id: string; day: string }[]> = {};
      for (const t of ticks.data) (byGoal[t.goal_id] ??= []).push(t);
      return { goals: goals.data as Goal[], ticks: byGoal };
    },
  });
}

/** This week's goals with their progress, and last week's recap. */
export function useGoals() {
  const list = useGoalList();
  const history = useStudyHistory(28);
  const sessions = useStudySessions(21, 100);
  const ready = !!(list.data && history.data && sessions.data);
  const now = today();
  const firstDay = weekStart();
  const sess: Session[] = (sessions.data ?? []).map((s) => ({ ...s, startDay: isoDate(new Date(s.started_at)) }));
  const tickDays = (id: string) => (list.data?.ticks[id] ?? []).map((t) => t.day);
  const week = weekOf(now, firstDay);
  const goals = (list.data?.goals ?? []).map((g) => ({ goal: g, ...goalProgress(g, week, history.data ?? [], sess, tickDays(g.id)) }));
  const recap = ready
    ? weeklyRecap({ today: now, firstDay, rows: history.data!, sessions: sess, goals: list.data!.goals, ticks: Object.fromEntries(list.data!.goals.map((g) => [g.id, tickDays(g.id)])) })
    : null;
  return { ready, goals, recap, week, ticks: list.data?.ticks ?? {} };
}

export function useGoalActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["goals"] });
  return {
    add: useMutation({
      mutationFn: async (g: { kind: GoalKind; target: number; label: string | null; subject_id: string | null }) => {
        const { error } = await supabase.from("goals").insert(g);
        if (error) throw error;
      },
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from("goals").delete().eq("id", id);
        if (error) throw error;
      },
      onSuccess: refresh,
    }),
    /** +1 on a custom goal today, or take back its latest tick. */
    tick: useMutation({
      mutationFn: async ({ goalId, undoId }: { goalId: string; undoId?: string }) => {
        const { error } = undoId ? await supabase.from("goal_ticks").delete().eq("id", undoId) : await supabase.from("goal_ticks").insert({ goal_id: goalId, day: today() });
        if (error) throw error;
      },
      onSuccess: refresh,
    }),
  };
}
