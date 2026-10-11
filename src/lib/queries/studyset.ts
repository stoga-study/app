import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "../supabase";
import type { Source } from "./sources";

type Progress = { done: number; total: number };
export type Steps = { notes?: Progress; cards?: Progress; quiz?: Progress; guide?: Progress; next?: number; failed?: string };

/** Ask the server to build (or resume) the study set. Safe to call twice: the server ignores repeats. */
export async function startGeneration(sourceId: string) {
  const { data, error } = await supabase.functions.invoke<{ status: string }>("generate", { body: { source_id: sourceId } });
  if (error) throw error;
  return data?.status;
}

/** Keeps a source fresh while its study set is being made: live updates, with polling as a backup. */
export function useLiveSource(id: string | undefined, status: string | undefined) {
  const qc = useQueryClient();
  const active = status === "generating";
  useEffect(() => {
    if (!id || !active) return;
    const channel = supabase
      .channel(`source-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sources", filter: `id=eq.${id}` }, (payload) => {
        qc.setQueryData(["source", id], payload.new as Source);
        if ((payload.new as Source).status !== "generating") {
          qc.invalidateQueries({ queryKey: ["studyset", id] });
          qc.invalidateQueries({ queryKey: ["due-cards"] });
        }
      })
      .subscribe();
    const poll = setInterval(() => qc.invalidateQueries({ queryKey: ["source", id] }), 4000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [id, active, qc]);
}

/** Overall progress: reading the file is the first 10%, then each generation job. */
export function progressOf(steps: Steps | null | undefined) {
  const parts = [steps?.notes, steps?.cards, steps?.quiz, steps?.guide];
  const total = parts.reduce((n, p) => n + (p?.total ?? 0), 0);
  const done = parts.reduce((n, p) => n + (p?.done ?? 0), 0);
  const pct = total ? Math.round(10 + (90 * done) / total) : 10;
  return { pct, remainingJobs: total - done };
}

export function useStudySet(sourceId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["studyset", sourceId],
    enabled: !!sourceId && enabled,
    queryFn: async () => {
      const id = sourceId!;
      const [notes, cards, quizzes, guide] = await Promise.all([
        supabase.from("notes_sections").select("id, title, body_md, pages").eq("source_id", id).order("position"),
        supabase.from("cards").select("id, front, back, pages").eq("source_id", id).order("created_at"),
        supabase.from("quizzes").select("id, title").eq("source_id", id).limit(1),
        supabase.from("guide_sections").select("id, title, body_md, minutes, pages").eq("source_id", id).order("position"),
      ]);
      for (const r of [notes, cards, quizzes, guide]) if (r.error) throw r.error;
      const quiz = quizzes.data![0] ?? null;
      let questions: { id: string; prompt: string; options: string[]; answer_index: number; hint: string | null; explanation: string; pages: number[] }[] = [];
      if (quiz) {
        const { data, error } = await supabase
          .from("quiz_questions").select("id, prompt, options, answer_index, hint, explanation, pages").eq("quiz_id", quiz.id).order("position");
        if (error) throw error;
        questions = data.map((q) => ({ ...q, options: q.options as string[] }));
      }
      return { notes: notes.data!, cards: cards.data!, quiz, questions, guide: guide.data! };
    },
  });
}
