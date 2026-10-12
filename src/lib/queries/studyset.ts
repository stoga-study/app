import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { Caps, GenOptions } from "../../../supabase/functions/_lib/options";
import { supabase } from "../supabase";
import { useProfile } from "./profile";
import type { Source } from "./sources";

type Progress = { done: number; total: number };
export type Steps = { notes?: Progress; cards?: Progress; quiz?: Progress; guide?: Progress; run?: number; next?: number; failed?: string; shared?: boolean };

/** Why a study set could not start: the month's study sets are used, a number is over the plan's cap, and so on. */
export class StartError extends Error {
  constructor(public code: "limit" | "over_cap" | "none_chosen" | "bad_options" | "unavailable", public caps?: Caps) {
    super(code);
    this.name = "StartError";
  }
}

/**
 * Make a study set (or more of one) with the student's choices, or resume one that failed (no options).
 * Safe to call twice: the server ignores repeats.
 */
export async function startGeneration(sourceId: string, options?: GenOptions) {
  const { data, error } = await supabase.functions.invoke<{ status: string; shared?: boolean }>("generate", {
    body: options ? { source_id: sourceId, options } : { source_id: sourceId },
  });
  if (error) {
    const j = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new StartError(j?.error ?? "unavailable", j?.caps);
  }
  return data?.status;
}

/** Most a file can make in one go on the student's plan. */
export function useCaps() {
  const profile = useProfile();
  const plan = profile.data?.plan ?? "essential";
  return useQuery({
    queryKey: ["caps", plan],
    enabled: !!profile.data,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<Caps> => {
      const { data, error } = await supabase.from("generation_caps").select("cards, quiz, guide").eq("plan", plan).single();
      if (error) throw error;
      return data;
    },
  });
}

/** What a student sees when a study set cannot start. */
export function startErrorText(e: unknown) {
  const code = e instanceof StartError ? e.code : "unavailable";
  if (code === "limit") return "That was this month's study sets. Saving files is still free, and your notes, cards and quizzes still work.";
  if (code === "over_cap") return `That is more than your plan can make from one file${e instanceof StartError && e.caps ? ` (up to ${e.caps.cards} cards, ${e.caps.quiz} questions, ${e.caps.guide} guide sections)` : ""}.`;
  if (code === "none_chosen") return "Pick at least one thing to make.";
  return "We could not start it. Check your connection, then try again.";
}

/** Keeps a source fresh while its study set is being made: live updates, with polling as a backup. */
export function useLiveSource(id: string | undefined, status: string | undefined) {
  const qc = useQueryClient();
  const active = status === "generating";
  // However the change arrived (live update or the polling backup), refresh the study set when a run ends.
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active && id) {
      qc.invalidateQueries({ queryKey: ["studyset", id] });
      qc.invalidateQueries({ queryKey: ["due-cards"] });
    }
    wasActive.current = active;
  }, [active, id, qc]);
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
        supabase.from("quizzes").select("id, title").eq("source_id", id).order("created_at"),
        supabase.from("guide_sections").select("id, title, body_md, minutes, pages").eq("source_id", id).order("position"),
      ]);
      for (const r of [notes, cards, quizzes, guide]) if (r.error) throw r.error;
      // A file can have several quizzes ("another practice quiz").
      type Question = { id: string; prompt: string; options: string[]; answer_index: number; hint: string | null; explanation: string; pages: number[] };
      const list: { id: string; title: string; questions: Question[] }[] = [];
      for (const quiz of quizzes.data!) {
        const { data, error } = await supabase
          .from("quiz_questions").select("id, prompt, options, answer_index, hint, explanation, pages").eq("quiz_id", quiz.id).order("position");
        if (error) throw error;
        list.push({ ...quiz, questions: data.map((q) => ({ ...q, options: q.options as string[] })) });
      }
      const questions = list.flatMap((q) => q.questions);
      return { notes: notes.data!, cards: cards.data!, quizzes: list, quiz: list[0] ?? null, questions, guide: guide.data! };
    },
  });
}
