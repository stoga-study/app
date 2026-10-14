import { useQuery } from "@tanstack/react-query";
import type { Json } from "../database.types";
import type { SaVerdict } from "../practiceTest";
import { supabase } from "../supabase";
import { asQuestions, Q_FIELDS, recordAnswer, type Question } from "./quiz";

export type PoolQuestion = Question & { kind: string; source_id: string | null; missed: boolean };
export type PoolCard = { id: string; front: string; back: string; state: number; lapses: number; difficulty: number; pages: number[]; source_id: string | null; kind: string };

/** Everything a practice test can ask about a class, or some of its units: quiz questions and cards. */
export function usePracticePool(subjectId: string | null, unitIds: string[]) {
  return useQuery({
    queryKey: ["practice-pool", subjectId, [...unitIds].sort().join(",")],
    enabled: !!subjectId,
    queryFn: async () => {
      let fq = supabase.from("sources").select("id, kind").eq("subject_id", subjectId!).eq("archived", false);
      if (unitIds.length) fq = fq.in("unit_id", unitIds);
      const { data: files, error: fErr } = await fq;
      if (fErr) throw fErr;
      const kindOf = new Map(files.map((f) => [f.id, f.kind]));
      if (unitIds.length && !files.length) return { questions: [] as PoolQuestion[], cards: [] as PoolCard[], weakTopics: [] as string[] };
      const ids = files.map((f) => f.id);
      // A whole class includes cards with no file (imported or made from notes); units only have filed ones.
      let cq = supabase.from("cards").select("id, front, back, state, lapses, difficulty, pages, source_id").eq("hidden", false).eq("archived", false);
      cq = unitIds.length ? cq.in("source_id", ids) : cq.eq("subject_id", subjectId!);
      const [quizzes, cards, open] = await Promise.all([
        supabase.from("quizzes").select("id, source_id").eq("archived", false).in("source_id", ids),
        cq.limit(2000),
        supabase.from("mistakes").select("question_id").is("resolved_at", null),
      ]);
      if (quizzes.error) throw quizzes.error;
      if (cards.error) throw cards.error;
      const srcOf = new Map(quizzes.data.map((z) => [z.id, z.source_id]));
      const qs = quizzes.data.length
        ? await supabase.from("quiz_questions").select(Q_FIELDS).eq("hidden", false).in("quiz_id", quizzes.data.map((z) => z.id)).limit(2000)
        : { data: [], error: null };
      if (qs.error) throw qs.error;
      const missed = new Set((open.data ?? []).map((m) => m.question_id));
      const questions: PoolQuestion[] = asQuestions(qs.data ?? []).map((q) => {
        const source_id = srcOf.get(q.quiz_id) ?? null;
        return { ...q, source_id, kind: (source_id && kindOf.get(source_id)) || "pdf", missed: missed.has(q.id) };
      });
      // Weakest topics: the ones with the most questions answered wrong and not yet put right.
      const counts = new Map<string, number>();
      for (const q of questions) if (q.missed && q.topic) counts.set(q.topic, (counts.get(q.topic) ?? 0) + 1);
      return {
        questions,
        cards: cards.data.map((c) => ({ ...c, kind: (c.source_id && kindOf.get(c.source_id)) || "pdf" })) as PoolCard[],
        weakTopics: [...counts].sort((a, b) => b[1] - a[1]).map(([t]) => t),
      };
    },
  });
}

export type TestResult =
  | { kind: "mc"; id: string; chosen: number | null; correct: boolean }
  | { kind: "sa"; id: string; answer: string; verdict: SaVerdict | null; feedback: string | null };

/**
 * Save a finished test, and send what was missed to review: wrong choice questions go to mistake
 * review (right ones clear an old mistake), and written answers that were not yet right bring their
 * card back into today's review.
 */
export async function finishTest(o: { subjectId: string; eventId: string | null; unitIds: string[]; results: TestResult[]; points: number; pct: number; seconds: number }) {
  const { error } = await supabase.from("practice_tests").insert({
    subject_id: o.subjectId, event_id: o.eventId, unit_ids: o.unitIds, total: o.results.length, points: o.points, pct: o.pct, seconds: o.seconds, items: o.results as unknown as Json,
  });
  if (error) throw error;
  for (const r of o.results) {
    if (r.kind === "mc" && r.chosen !== null) {
      await recordAnswer({ attemptId: null, questionId: r.id, chosen: r.chosen, correct: r.correct, answers: [], correctSoFar: 0, finished: false });
    }
  }
  const missedCards = o.results.filter((r) => r.kind === "sa" && r.verdict !== "right").map((r) => r.id);
  if (missedCards.length) await supabase.from("cards").update({ due: new Date().toISOString() }).in("id", missedCards);
}

/** Recent practice tests for a class, newest first. */
export function usePracticeTests(subjectId: string | undefined) {
  return useQuery({
    queryKey: ["practice-tests", subjectId],
    enabled: !!subjectId,
    queryFn: async () => {
      const { data, error } = await supabase.from("practice_tests").select("id, event_id, unit_ids, total, points, pct, seconds, finished_at").eq("subject_id", subjectId!).order("finished_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
  });
}

/** Key terms from the files in a class, or in some of its units, for the review pack. */
export function useKeyTerms(subjectId: string | null, unitIds: string[]) {
  return useQuery({
    queryKey: ["key-terms", subjectId, [...unitIds].sort().join(",")],
    enabled: !!subjectId,
    queryFn: async () => {
      let fq = supabase.from("sources").select("id").eq("subject_id", subjectId!).eq("archived", false);
      if (unitIds.length) fq = fq.in("unit_id", unitIds);
      const { data: files, error: fErr } = await fq;
      if (fErr) throw fErr;
      if (!files.length) return [];
      const { data, error } = await supabase.from("key_terms").select("id, term, definition").eq("hidden", false).in("source_id", files.map((f) => f.id)).order("position").limit(60);
      if (error) throw error;
      // The same term from two files appears once.
      const seen = new Set<string>();
      return data.filter((t) => !seen.has(t.term.toLowerCase()) && seen.add(t.term.toLowerCase()));
    },
  });
}
