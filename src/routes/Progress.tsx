import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Heatmap, TrendLine } from "@/components/HistoryCharts";
import { GoalsSection } from "@/components/Goals";
import { StreakSettings } from "@/components/Streak";
import { MilestonesSection } from "@/components/Milestones";
import { MasteryChip } from "@/components/MasteryChip";
import { PageHeader } from "@/components/PageHeader";
import { PageSkeleton } from "@/components/States";
import { useAuth } from "@/lib/auth/session";
import { today } from "@/lib/calendar";
import { byClass, consistency, dayTotals, heatmap, weeklyTrend } from "@/lib/history";
import { dateFormat, weekStart } from "@/lib/locale";
import { useStudyHistory, useStudySessions, type StudySession } from "@/lib/queries/history";
import { useMastery } from "@/lib/queries/mastery";
import { useSubjects } from "@/lib/queries/profile";
import { useMistakes, useQuizList } from "@/lib/queries/quiz";
import { supabase } from "@/lib/supabase";

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

const WEEKDAYS = (i: number) => dateFormat({ weekday: "long" }).format(new Date(2026, 9, 4 + i)) + "s";

function sessionText(s: StudySession) {
  const parts = [
    s.reviews && `${s.reviews} card${s.reviews === 1 ? "" : "s"}`,
    s.quiz_answers && `${s.quiz_answers} quiz answer${s.quiz_answers === 1 ? "" : "s"}`,
    s.practice_tests && `${s.practice_tests} practice test${s.practice_tests === 1 ? "" : "s"}`,
    s.tutor && `${s.tutor} tutor question${s.tutor === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return parts.join(" · ");
}

export default function Progress() {
  const history = useStudyHistory(182);
  const sessions = useStudySessions(30);
  const stats = useCardStats();
  const quizzes = useQuizList();
  const mistakes = useMistakes();
  const subjects = useSubjects();
  const m = useMastery();
  if (history.isPending || stats.isPending) return <PageSkeleton label="Adding up your progress." />;

  const rows = history.data ?? [];
  const now = today();
  const first = weekStart();
  const totals = dayTotals(rows);
  const weeks = heatmap(totals, now, 20, first);
  const thisWeek = weeks.at(-1)!.filter((c) => !c.future);
  const weekActivity = thisWeek.reduce((n, c) => n + c.total.activity, 0);
  const weekDays = thisWeek.filter((c) => c.total.activity > 0).length;
  const cons = consistency(totals, now, 28);
  const recall = weeklyTrend(rows, now, 8, "review", first);
  const quizTrend = weeklyTrend(rows, now, 8, "quiz", first);
  const classes = byClass(rows, now);
  const name = (id: string) => subjects.data?.find((s) => s.id === id)?.name ?? "";
  const topics = [...(mistakes.data ?? []).reduce((acc, x) => acc.set(x.question.topic || "Other", (acc.get(x.question.topic || "Other") ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topMax = Math.max(1, ...topics.map((t) => t[1]));
  const taken = (quizzes.data ?? []).filter((q) => q.last);
  const totalActive = [...totals.values()].filter((t) => t.activity > 0).length;
  const fmtSession = dateFormat({ weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <>
      <PageHeader title="Progress">How your studying is going, in plain numbers.</PageHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="ink-panel burgundy p-6" aria-labelledby="week">
          <span className="circle circle-big right-[-4rem] top-[-5rem] size-52" aria-hidden="true" />
          <p id="week" className="text-[0.9375rem] text-[#F7EAEC]">Studied this week</p>
          <p className="big-num mt-1 text-[5rem]">{weekActivity}</p>
          <p className="text-[#F7EAEC]">
            {weekActivity ? `cards, answers and questions across ${weekDays} day${weekDays === 1 ? "" : "s"}` : "Nothing yet this week. Ten minutes today is a great start."}
          </p>
          <div className="mt-4 flex h-16 items-end gap-2" role="img" aria-label={`Each day this week: ${thisWeek.map((c) => c.total.activity).join(", ")}`}>
            {weeks.at(-1)!.map((c) => {
              const max = Math.max(1, ...weeks.at(-1)!.map((x) => x.total.activity));
              return (
                <div key={c.day} className="flex flex-1 flex-col items-center gap-1">
                  <div className="w-full rounded-t-[4px] bg-white/85" style={{ height: `${Math.max(3, (c.total.activity / max) * 44)}px`, opacity: c.future ? 0 : c.total.activity ? 1 : 0.25 }} />
                  <span className="text-[0.75rem] text-[#F7EAEC]">{dateFormat({ weekday: "narrow" }).format(new Date(`${c.day}T12:00:00`))}</span>
                </div>
              );
            })}
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

      <GoalsSection />
      <StreakSettings />

      <section className="card mt-4 p-6" aria-labelledby="history-h">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="history-h" className="text-[1.375rem]">Study history</h2>
          <p className="text-[0.9375rem] text-muted">
            {cons.active ? `${cons.active} of the last ${cons.days} days · about ${cons.perWeek} days a week${cons.bestWeekday != null ? ` · most on ${WEEKDAYS(cons.bestWeekday)}` : ""}` : "Your study days will fill in here."}
          </p>
        </div>
        <Heatmap weeks={weeks} summary={`Studied on ${totalActive} days in the last 20 weeks, and ${cons.active} of the last 28.`} />
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="card p-6"><TrendLine points={recall} label="Card recall" /><p className="mt-2 text-[0.8125rem] text-muted">Cards you got right each week. Steady is great; it dips when you add new material.</p></section>
        <section className="card p-6"><TrendLine points={quizTrend} label="Quiz accuracy" /><p className="mt-2 text-[0.8125rem] text-muted">Practice quizzes and tests, each week.</p></section>
      </div>

      {(classes.length > 0 || (m.ready && (subjects.data ?? []).some((x) => m.forClass(x.id)))) && (
        <section className="card mt-4 p-6" aria-labelledby="classes-h">
          <h2 id="classes-h" className="text-[1.375rem]">By class</h2>
          <p className="text-[0.875rem] text-muted">The last 30 days, against the 30 before.</p>
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {(subjects.data ?? []).map((x) => ({ x, c: classes.find((c) => c.subject_id === x.id), mm: m.forClass(x.id) })).filter(({ c, mm }) => c || mm).sort((a, b) => (b.c?.recent ?? 0) - (a.c?.recent ?? 0)).map(({ x, c, mm }) => (
              <li key={x.id}>
                <Link to={`/subjects/${x.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-3 text-ink no-underline sm:grid-cols-[1fr_8rem_9rem_auto]">
                  <span className="min-w-0 truncate font-bold">{x.name}</span>
                  <span className="justify-self-end sm:order-last"><MasteryChip m={mm} /></span>
                  <span className="flex items-center gap-1 text-[0.875rem] text-muted tabular">
                    {c?.trend === "up" ? <ArrowUpRight className="size-4 text-brand" aria-label="More than before" /> : c?.trend === "down" ? <ArrowDownRight className="size-4" aria-label="Less than before" /> : c?.trend === "flat" ? <ArrowRight className="size-4" aria-label="About the same" /> : <Sparkles className="size-4 text-brand" aria-label="New" />}
                    {c?.recent ?? 0} studied
                  </span>
                  <span className="text-[0.875rem] text-muted tabular">
                    {[c?.recallPct != null ? `recall ${c.recallPct}%` : null, c?.quizPct != null ? `quizzes ${c.quizPct}%` : null].filter(Boolean).join(" · ") || "–"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="card p-6" aria-labelledby="sessions-h">
          <h2 id="sessions-h" className="text-[1.375rem]">Recent sessions</h2>
          {!sessions.data?.length ? (
            <p className="mt-3 text-muted">Your study sessions will show up here.</p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-line">
              {sessions.data.slice(0, 8).map((s) => {
                const mins = Math.max(1, Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 60000));
                return (
                  <li key={s.started_at} className="py-2.5">
                    <p className="flex items-baseline justify-between gap-2"><b className="truncate">{s.subject_ids.map(name).filter(Boolean).join(", ") || "Studying"}</b><span className="flex-none text-[0.8125rem] text-muted tabular">{mins} min</span></p>
                    <p className="text-[0.875rem] text-muted">{fmtSession.format(new Date(s.started_at))} · {sessionText(s)}{s.graded >= 5 ? ` · ${Math.round((100 * s.correct) / s.graded)}% right` : ""}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
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
          {taken.length > 0 && (
            <>
              <h3 className="mt-6 font-bold">Latest quiz results</h3>
              <ul className="mt-2 flex flex-col divide-y divide-line">
                {taken.slice(0, 5).map((q) => (
                  <li key={q.id} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1"><span className="block truncate">{q.title}</span><span className="block text-[0.8125rem] text-muted">{name(q.subject_id)}</span></span>
                    <b className="tabular">{Math.round((q.last!.correct / q.last!.total) * 100)}%</b>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <MilestonesSection />

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
