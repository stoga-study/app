import { CalendarClock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { MasteryChip } from "@/components/MasteryChip";
import { PageHeader } from "@/components/PageHeader";
import { useMastery } from "@/lib/queries/mastery";
import { PageSkeleton } from "@/components/States";
import { useAuth } from "@/lib/auth/session";
import { useSubjects } from "@/lib/queries/profile";
import { useMistakes, useQuizList } from "@/lib/queries/quiz";
import { useReviewHistory } from "@/lib/queries/review";
import { supabase } from "@/lib/supabase";
import { dateFormat } from "@/lib/locale";

function useCardStats() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["card-stats", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("cards").select("state").eq("hidden", false).eq("archived", false);
      if (error) throw error;
      return { total: data.length, learning: data.filter((c) => c.state === 1 || c.state === 3).length, learned: data.filter((c) => c.state === 2).length };
    },
  });
}

export default function Progress() {
  const history = useReviewHistory(7);
  const stats = useCardStats();
  const quizzes = useQuizList();
  const mistakes = useMistakes();
  const subjects = useSubjects();
  const m = useMastery();
  if (history.isPending || stats.isPending) return <PageSkeleton label="Adding up your progress." />;
  const days = history.data ?? [];
  const week = days.reduce((n, d) => n + d.count, 0);
  const max = Math.max(1, ...days.map((d) => d.count));
  const name = (id: string) => subjects.data?.find((s) => s.id === id)?.name ?? "";
  const topics = [...(mistakes.data ?? []).reduce((m, x) => m.set(x.question.topic || "Other", (m.get(x.question.topic || "Other") ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topMax = Math.max(1, ...topics.map((t) => t[1]));
  const taken = (quizzes.data ?? []).filter((q) => q.last);

  return (
    <>
      <PageHeader title="Progress">How your studying is going, in plain numbers.</PageHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="ink-panel burgundy p-6" aria-labelledby="week">
          <span className="circle circle-big right-[-4rem] top-[-5rem] size-52" aria-hidden="true" />
          <p id="week" className="text-[0.9375rem] text-[#F7EAEC]">Cards reviewed this week</p>
          <p className="big-num mt-1 text-[5rem]">{week}</p>
          <div className="mt-4 flex h-24 items-end gap-2" role="img" aria-label={`Reviews per day: ${days.map((d) => d.count).join(", ")}`}>
            {days.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-t-md bg-white/85" style={{ height: `${Math.max(4, (d.count / max) * 72)}px`, opacity: d.count ? 1 : 0.25 }} />
                <span className="text-[0.75rem] text-[#F7EAEC]">{dateFormat({ weekday: "narrow" }).format(new Date(d.date))}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card p-6" aria-labelledby="cards-h">
          <h2 id="cards-h" className="text-[1.375rem]">Your cards</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {[["In long-term review", stats.data?.learned ?? 0], ["Still learning", stats.data?.learning ?? 0], ["Not seen yet", (stats.data?.total ?? 0) - (stats.data?.learned ?? 0) - (stats.data?.learning ?? 0)]].map(([label, n]) => (
              <li key={label as string} className="flex items-center justify-between"><span>{label}</span><b className="tabular">{n}</b></li>
            ))}
          </ul>
          <p className="mt-3 text-[0.875rem] text-muted">{stats.data?.total ?? 0} cards in all.</p>
        </section>
      </div>

      {m.ready && (subjects.data ?? []).some((x) => m.forClass(x.id)) && (
        <section className="card mt-4 p-6" aria-labelledby="mastery-h">
          <h2 id="mastery-h" className="text-[1.375rem]">Mastery by class</h2>
          <p className="text-[0.875rem] text-muted">From how well your cards are sticking and your latest quiz scores. Open a class to see each unit.</p>
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {(subjects.data ?? []).map((x) => ({ x, mm: m.forClass(x.id) })).filter(({ mm }) => mm).map(({ x, mm }) => (
              <li key={x.id}>
                <Link to={`/subjects/${x.id}`} className="flex items-center gap-3 py-3 text-ink no-underline">
                  <span className="min-w-0 flex-1 truncate font-bold">{x.name}</span>
                  <MasteryChip m={mm} />
                  <b className="w-12 text-right tabular">{Math.round(mm!.score * 100)}%</b>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="card p-6" aria-labelledby="weak">
          <h2 id="weak" className="text-[1.375rem]">Weak spots</h2>
          <p className="text-[0.875rem] text-muted">Topics with the most questions to revisit.</p>
          {topics.length === 0 ? (
            <p className="mt-3 text-muted">None right now. Take a quiz to find them.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {topics.map(([t, n]) => (
                <li key={t} className="grid grid-cols-[1fr_6rem_2rem] items-center gap-3">
                  <span className="truncate">{t}</span>
                  <div className="bar accent" role="img" aria-label={`${t}: ${n} to revisit`}><span style={{ width: `${(n / topMax) * 100}%` }} /></div>
                  <b className="text-right tabular">{n}</b>
                </li>
              ))}
            </ul>
          )}
          {topics.length > 0 && <Link to="/mistakes" className="mt-4 inline-block font-bold">Review mistakes</Link>}
        </section>
        <section className="card p-6" aria-labelledby="quizzes-h">
          <h2 id="quizzes-h" className="text-[1.375rem]">Latest quiz results</h2>
          {taken.length === 0 ? (
            <p className="mt-3 text-muted">No quizzes taken yet.</p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-line">
              {taken.slice(0, 6).map((q) => (
                <li key={q.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1"><span className="block truncate font-bold">{q.title}</span><span className="block text-[0.8125rem] text-muted">{name(q.subject_id)}</span></span>
                  <b className="tabular">{Math.round((q.last!.correct / q.last!.total) * 100)}%</b>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Link to="/calendar?view=plan" className="card card-dashed mt-4 flex items-start gap-4 p-5 text-ink no-underline">
        <span className="tile soft"><CalendarClock /></span>
        <div>
          <p className="font-bold">Study plan and exam prep</p>
          <p className="text-[0.9375rem] text-muted">Add your tests to the calendar for a day-by-day plan, readiness and practice tests.</p>
        </div>
      </Link>
    </>
  );
}
