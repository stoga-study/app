import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
import { mastery, type Mastery } from "../mastery";
import { supabase } from "../supabase";
import { useQuizList } from "./quiz";
import { useSources } from "./sources";

/** Mastery for every class and unit, from a slim copy of each card plus each quiz's latest score. */
export function useMastery() {
  const { session } = useAuth();
  const cards = useQuery({
    queryKey: ["mastery-cards", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("cards").select("subject_id, state, stability, sources(unit_id)").limit(20000);
      if (error) throw error;
      return data.map((c) => ({ subject_id: c.subject_id, state: c.state, stability: c.stability, unit_id: (c.sources as unknown as { unit_id: string | null } | null)?.unit_id ?? null }));
    },
  });
  const quizzes = useQuizList();
  const sources = useSources();
  const ready = !!cards.data && !!quizzes.data && !!sources.data;
  const unitOf = new Map((sources.data ?? []).map((s) => [s.id, s.unit_id]));
  const scored = (quizzes.data ?? []).filter((q) => q.last).map((q) => ({ ...q.last!, subject_id: q.subject_id, unit_id: q.source_id ? unitOf.get(q.source_id) ?? null : null }));
  const forClass = (subjectId: string): Mastery | null =>
    mastery((cards.data ?? []).filter((c) => c.subject_id === subjectId), scored.filter((q) => q.subject_id === subjectId));
  const forUnit = (unitId: string): Mastery | null =>
    mastery((cards.data ?? []).filter((c) => c.unit_id === unitId), scored.filter((q) => q.unit_id === unitId));
  return { ready, forClass, forUnit };
}
