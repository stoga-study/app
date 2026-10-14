import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
import { fromIso, today } from "../calendar";
import { buildPlan, type ExamScope, HORIZON } from "../plan";
import { usePlanMinutes } from "../preferences";
import { supabase } from "../supabase";
import { daysBetween } from "../calendar";
import { unitName } from "../units";
import { isExam, useEvents, type CalEvent } from "./events";
import { readiness, type Readiness } from "../readiness";
import { useMistakes, useQuizList } from "./quiz";
import { useSources } from "./sources";
import { useAllUnits } from "./units";

/** Today's finished plan tasks (keys). */
export function usePlanDone() {
  const { session } = useAuth();
  const day = today();
  return useQuery({
    queryKey: ["plan-done", session?.user.id, day],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("plan_done").select("key").eq("day", day);
      if (error) throw error;
      return new Set(data.map((r) => r.key));
    },
  });
}

/** Mark a plan task done for today (finishing a quiz does this too). */
export async function markPlanDone(key: string) {
  const { error } = await supabase.from("plan_done").upsert({ day: today(), key }, { onConflict: "user_id,day,key", ignoreDuplicates: true });
  if (error) throw error;
}

export function useTogglePlanDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, done }: { key: string; done: boolean }) => {
      if (done) return markPlanDone(key);
      const { error } = await supabase.from("plan_done").delete().eq("day", today()).eq("key", key);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["plan-done"] }),
  });
}

/** Every card's class, unit, state and due time, and which were reviewed today: the planner's inputs. */
function usePlanCards() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["plan-cards", session?.user.id],
    enabled: !!session,
    // Reviews change it all day: check again whenever a page with the plan opens.
    refetchOnMount: "always",
    queryFn: async () => {
      const start = fromIso(today()).toISOString();
      const [cards, reviews, guides] = await Promise.all([
        supabase.from("cards").select("id, subject_id, state, due, sources(unit_id)").eq("hidden", false).eq("archived", false).limit(20000),
        supabase.from("card_reviews").select("card_id").gte("reviewed_at", start),
        supabase.from("guide_sections").select("source_id, minutes").eq("hidden", false),
      ]);
      if (cards.error) throw cards.error;
      if (reviews.error) throw reviews.error;
      if (guides.error) throw guides.error;
      const guideMinutes = new Map<string, number>();
      for (const g of guides.data) guideMinutes.set(g.source_id, (guideMinutes.get(g.source_id) ?? 0) + (g.minutes ?? 3));
      return {
        cards: cards.data.map((c) => ({ id: c.id, subject_id: c.subject_id, state: c.state, due: c.due, unit_id: (c.sources as unknown as { unit_id: string | null } | null)?.unit_id ?? null })),
        reviewed: new Set(reviews.data.map((r) => r.card_id)),
        guideMinutes,
      };
    },
  });
}

/** What the planner and readiness both read: the calendar, cards, quizzes, mistakes, files and units. */
function useStudyData() {
  const events = useEvents();
  const data = usePlanCards();
  const mistakes = useMistakes();
  const quizzes = useQuizList();
  const sources = useSources();
  const units = useAllUnits();
  if (!(events.data && data.data && mistakes.data && quizzes.data && sources.data && units.data)) return null;
  const unitOf = new Map(sources.data.map((s) => [s.id, s.unit_id]));
  return { events: events.data, ...data.data, mistakes: mistakes.data, quizzes: quizzes.data, sources: sources.data, units: units.data, unitOf };
}
type StudyData = NonNullable<ReturnType<typeof useStudyData>>;

/** Whether something in a class and unit counts towards a test (all of the class when it names no units). */
const coversFor = (e: CalEvent) => (subjectId: string, unitId: string | null) =>
  subjectId === e.subject_id && (!e.unit_ids.length || (!!unitId && e.unit_ids.includes(unitId)));

/** The study plan for the next week, from the calendar's upcoming tests and quizzes. */
export function usePlan() {
  const d = useStudyData();
  const done = usePlanDone();
  const [minutes] = usePlanMinutes();
  if (!d || !done.data) return { ready: false as const, days: [], exams: [] as ExamScope[] };

  const now = new Date().toISOString();
  const day = today();
  const exams: ExamScope[] = [];
  for (const e of d.events) {
    const left = daysBetween(day, e.due_on);
    if (!isExam(e.kind) || !e.subject_id || left < 1 || left > HORIZON) continue;
    const covers = coversFor(e);
    const cards = d.cards.filter((c) => covers(c.subject_id, c.unit_id));
    const due = cards.filter((c) => c.due <= now);
    const unitQuizzes = e.unit_ids
      .filter((u) => d.quizzes.some((q) => q.count > 0 && q.source_id && d.unitOf.get(q.source_id) === u))
      .map((u) => ({ key: `quiz:unit:${u}`, href: `/quiz/unit?unit=${u}`, label: unitName(d.units.find((x) => x.id === u) ?? { number: null, title: "this unit" }) }));
    const classQuizzes = d.quizzes
      .filter((q) => q.subject_id === e.subject_id && q.count > 0)
      .sort((a, b) => (a.last ? a.last.correct / a.last.total : -1) - (b.last ? b.last.correct / b.last.total : -1))
      .map((q) => ({ key: `quiz:${q.id}`, href: `/quiz/${q.id}`, label: q.title }));
    exams.push({
      id: e.id,
      title: e.title,
      due_on: e.due_on,
      dueNow: due.length,
      fresh: due.filter((c) => c.state === 0).length,
      reviewedToday: cards.filter((c) => d.reviewed.has(c.id)).length,
      reviewHref: `/review/session?subject=${e.subject_id}${e.unit_ids.length === 1 ? `&unit=${e.unit_ids[0]}` : ""}`,
      mistakes: d.mistakes.filter((m) => covers(m.question.subject_id, m.question.source_id ? d.unitOf.get(m.question.source_id) ?? null : null)).length,
      quizzes: e.unit_ids.length ? unitQuizzes : classQuizzes,
      guides: d.sources
        .filter((s) => !s.archived && covers(s.subject_id, s.unit_id) && d.guideMinutes.has(s.id))
        .map((s) => ({ key: `guide:${s.id}`, href: `/sources/${s.id}?tab=guide`, label: s.filename, minutes: d.guideMinutes.get(s.id)! })),
    });
  }
  return { ready: true as const, days: buildPlan({ today: day, exams, budget: Number(minutes), done: done.data }), exams };
}

function readinessIn(d: StudyData, covers: (subjectId: string, unitId: string | null) => boolean) {
  const qs = d.quizzes.filter((q) => q.count > 0 && covers(q.subject_id, q.source_id ? d.unitOf.get(q.source_id) ?? null : null));
  return readiness({
    cards: d.cards.filter((c) => covers(c.subject_id, c.unit_id)),
    quizzes: qs.filter((q) => q.last).map((q) => q.last!),
    quizzesAvailable: qs.length,
    mistakes: d.mistakes.filter((m) => covers(m.question.subject_id, m.question.source_id ? d.unitOf.get(m.question.source_id) ?? null : null)).length,
  });
}

/** Readiness for a test or quiz on the calendar, overall and for each unit it covers. */
export function useReadiness() {
  const d = useStudyData();
  return (e: CalEvent): { overall: Readiness | null; units: { id: string; name: string; r: Readiness | null }[] } | null => {
    if (!d || !e.subject_id || !isExam(e.kind)) return null;
    return {
      overall: readinessIn(d, coversFor(e)),
      units: e.unit_ids.length > 1
        ? e.unit_ids.map((u) => ({ id: u, name: unitName(d.units.find((x) => x.id === u) ?? { number: null, title: "Unit" }), r: readinessIn(d, (s, unit) => s === e.subject_id && unit === u) }))
        : [],
    };
  };
}
