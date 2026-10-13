import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
import type { Json } from "../database.types";
import { supabase } from "../supabase";

export type Question = {
  id: string; quiz_id: string; prompt: string; options: string[]; answer_index: number; hint: string | null;
  explanation: string; topic: string | null; pages: number[];
};
const Q_FIELDS = "id, quiz_id, prompt, options, answer_index, hint, explanation, topic, pages";
const asQuestions = (rows: unknown[]) => (rows as (Omit<Question, "options"> & { options: unknown })[]).map((q) => ({ ...q, options: q.options as string[] }));

/** A quiz with its questions, the source kind (for page chips) and the last finished attempt. */
export function useQuiz(id: string | undefined) {
  return useQuery({
    queryKey: ["quiz", id],
    enabled: !!id,
    queryFn: async () => {
      const { data: quiz, error } = await supabase.from("quizzes").select("id, title, subject_id, source_id, sources(kind)").eq("id", id!).maybeSingle();
      if (error) throw error;
      if (!quiz) return null;
      const [qs, last] = await Promise.all([
        supabase.from("quiz_questions").select(Q_FIELDS).eq("quiz_id", id!).order("position"),
        supabase.from("quiz_attempts").select("correct, total, finished_at").eq("quiz_id", id!).not("finished_at", "is", null).order("finished_at", { ascending: false }).limit(1),
      ]);
      if (qs.error) throw qs.error;
      if (last.error) throw last.error;
      const kind = (quiz.sources as unknown as { kind: string } | null)?.kind ?? "pdf";
      return { quiz, kind, questions: asQuestions(qs.data), last: last.data[0] ?? null };
    },
  });
}

export type Mistake = { id: string; question_id: string; chosen_index: number | null; created_at: string; question: Question & { kind: string; subject_id: string } };

/** Unresolved mistakes with their questions, newest first. */
export function useMistakes() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["mistakes", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data: ms, error } = await supabase.from("mistakes").select("id, question_id, chosen_index, created_at").is("resolved_at", null).order("created_at", { ascending: false });
      if (error) throw error;
      if (!ms.length) return [] as Mistake[];
      const { data: qs, error: qErr } = await supabase.from("quiz_questions").select(Q_FIELDS).in("id", ms.map((m) => m.question_id));
      if (qErr) throw qErr;
      const quizIds = [...new Set(qs.map((q) => q.quiz_id))];
      const { data: quizzes, error: zErr } = await supabase.from("quizzes").select("id, subject_id, sources(kind)").in("id", quizIds);
      if (zErr) throw zErr;
      const byQuiz = new Map(quizzes.map((z) => [z.id, z]));
      const byQ = new Map(asQuestions(qs).map((q) => [q.id, q]));
      return ms.flatMap((m) => {
        const q = byQ.get(m.question_id);
        if (!q) return [];
        const z = byQuiz.get(q.quiz_id);
        return [{ ...m, question: { ...q, subject_id: z?.subject_id ?? "", kind: (z?.sources as unknown as { kind: string } | null)?.kind ?? "pdf" } }];
      });
    },
  });
}

/** Quizzes for the Review page, with each one's latest score. */
export function useQuizList() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["quiz-list", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const [qz, at] = await Promise.all([
        supabase.from("quizzes").select("id, title, subject_id, source_id, created_at, quiz_questions!quiz_questions_quiz_id_fkey(count)").order("created_at", { ascending: false }),
        supabase.from("quiz_attempts").select("quiz_id, correct, total, finished_at").not("finished_at", "is", null).order("finished_at", { ascending: false }),
      ]);
      if (qz.error) throw qz.error;
      if (at.error) throw at.error;
      const latest = new Map<string, { correct: number; total: number }>();
      for (const a of at.data) if (!latest.has(a.quiz_id)) latest.set(a.quiz_id, a);
      return qz.data.map((q) => ({
        id: q.id, title: q.title, subject_id: q.subject_id, source_id: q.source_id,
        count: ((q as unknown as { quiz_questions: { count: number }[] }).quiz_questions)[0]?.count ?? 0,
        last: latest.get(q.id) ?? null,
      }));
    },
  });
}

export async function startAttempt(quizId: string, total: number) {
  const { data, error } = await supabase.from("quiz_attempts").insert({ quiz_id: quizId, total, answers: [] }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function recordAnswer(opts: { attemptId: string | null; questionId: string; chosen: number; correct: boolean; answers: Json[]; correctSoFar: number; finished: boolean }) {
  if (opts.attemptId) {
    await supabase.from("quiz_attempts").update({
      answers: opts.answers, correct: opts.correctSoFar, ...(opts.finished ? { finished_at: new Date().toISOString() } : {}),
    }).eq("id", opts.attemptId);
  }
  if (opts.correct) {
    // Getting it right clears it from mistake review.
    await supabase.from("mistakes").update({ resolved_at: new Date().toISOString() }).eq("question_id", opts.questionId).is("resolved_at", null);
  } else {
    await supabase.from("mistakes").upsert(
      { question_id: opts.questionId, attempt_id: opts.attemptId, chosen_index: opts.chosen, resolved_at: null, created_at: new Date().toISOString() },
      { onConflict: "user_id,question_id" },
    );
  }
}

/**
 * The quiz to finish: the latest attempt with answers, if it was left part-way in the last week
 * (a later full try of any quiz means there is nothing to resume).
 */
export function useUnfinishedQuiz() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["unfinished-quiz", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quiz_attempts")
        .select("id, quiz_id, total, answers, finished_at, created_at, quizzes!quiz_attempts_quiz_id_fkey(title)")
        .neq("answers", "[]")
        .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const a = data[0];
      const done = Array.isArray(a?.answers) ? a.answers.length : 0;
      if (!a || a.finished_at || done === 0 || done >= a.total) return null;
      return { attemptId: a.id, quizId: a.quiz_id, title: (a.quizzes as unknown as { title: string } | null)?.title ?? "Practice quiz", done, total: a.total, at: a.created_at };
    },
  });
}

/** A part-done attempt's answers, to pick the quiz back up where it was left. */
export async function loadAttempt(id: string) {
  const { data, error } = await supabase.from("quiz_attempts").select("id, quiz_id, answers, finished_at").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * "Practise this unit": questions from every quiz made from the unit's files. Open mistakes come
 * first, then the rest in a fresh order each time; at most `limit`.
 */
export function useUnitQuestions(unitId: string | undefined, limit = 15) {
  return useQuery({
    queryKey: ["unit-questions", unitId],
    enabled: !!unitId,
    queryFn: async () => {
      const { data: files, error: fErr } = await supabase.from("sources").select("id, kind").eq("unit_id", unitId!);
      if (fErr) throw fErr;
      if (!files.length) return [];
      const { data: quizzes, error: zErr } = await supabase.from("quizzes").select("id, source_id").in("source_id", files.map((f) => f.id));
      if (zErr) throw zErr;
      if (!quizzes.length) return [];
      const { data: qs, error } = await supabase.from("quiz_questions").select(Q_FIELDS).in("quiz_id", quizzes.map((z) => z.id));
      if (error) throw error;
      const { data: open } = await supabase.from("mistakes").select("question_id").is("resolved_at", null).in("question_id", qs.map((q) => q.id));
      const missed = new Set((open ?? []).map((m) => m.question_id));
      const kindOf = new Map(quizzes.map((z) => [z.id, files.find((f) => f.id === z.source_id)?.kind ?? "pdf"]));
      const shuffled = asQuestions(qs).map((q) => ({ q, r: Math.random() })).sort((a, b) => Number(missed.has(b.q.id)) - Number(missed.has(a.q.id)) || a.r - b.r);
      return shuffled.slice(0, limit).map(({ q }) => ({ ...q, kind: kindOf.get(q.quiz_id) ?? "pdf" }));
    },
  });
}

/** How many questions each unit has to practise (for showing the button only where it works). */
export function useUnitQuestionCounts(subjectId: string | undefined) {
  return useQuery({
    queryKey: ["unit-question-counts", subjectId],
    enabled: !!subjectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quizzes")
        .select("source_id, sources!inner(unit_id), quiz_questions!quiz_questions_quiz_id_fkey(count)")
        .eq("subject_id", subjectId!)
        .not("sources.unit_id", "is", null);
      if (error) throw error;
      const out: Record<string, number> = {};
      for (const z of data as unknown as { sources: { unit_id: string }; quiz_questions: { count: number }[] }[])
        out[z.sources.unit_id] = (out[z.sources.unit_id] ?? 0) + (z.quiz_questions[0]?.count ?? 0);
      return out;
    },
  });
}
