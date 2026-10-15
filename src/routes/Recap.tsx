import { ArrowLeft, Check, X } from "lucide-react";
import { Link } from "react-router";
import { GoalRing } from "@/components/Goals";
import { PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { addDays, isoDate, shortDate } from "@/lib/calendar";
import { goalName, goalProgress, goalText } from "@/lib/goals";
import { dayTotals } from "@/lib/history";
import { dateFormat } from "@/lib/locale";
import { useGoalList, useGoals } from "@/lib/queries/goals";
import { useStudyHistory, useStudySessions } from "@/lib/queries/history";
import { useSubjects } from "@/lib/queries/profile";

/** /recap: last week in full: what was studied, accuracy, goals, the best day, and one thing to try this week. */
export default function Recap() {
  const g = useGoals();
  const list = useGoalList();
  const history = useStudyHistory(28);
  const sessions = useStudySessions(21, 100);
  const subjects = useSubjects();
  if (!g.ready || !g.recap || !history.data || !list.data) return <PageSkeleton label="Putting your week together." />;
  const r = g.recap;
  const name = (id: string | null) => subjects.data?.find((s) => s.id === id)?.name ?? null;
  const totals = dayTotals(history.data);
  const days = Array.from({ length: 7 }, (_, i) => addDays(r.week.start, i));
  const max = Math.max(1, ...days.map((d) => totals.get(d)?.activity ?? 0));
  const sess = (sessions.data ?? []).map((s) => ({ ...s, startDay: isoDate(new Date(s.started_at)) }));
  const lastWeekGoals = list.data.goals.map((goal) => ({ goal, ...goalProgress(goal, r.week, history.data!, sess, (list.data!.ticks[goal.id] ?? []).map((t) => t.day)) }));

  return (
    <section className="mx-auto max-w-2xl" aria-labelledby="recap-title">
      <Link to="/progress" className="mb-4 inline-flex min-h-11 items-center gap-2 font-bold text-ink-2 no-underline"><ArrowLeft className="size-5" /> Progress</Link>
      <p className="text-muted">{shortDate(r.week.start)} to {shortDate(r.week.end)}</p>
      <h1 id="recap-title" className="text-[2.25rem] md:text-[2.75rem]">Your week in review</h1>

      <div className="ink-panel burgundy mt-5 p-6">
        <span className="circle circle-big right-[-4rem] top-[-5rem] size-52" aria-hidden="true" />
        <p className="text-[#F7EAEC]">Studied</p>
        <p className="big-num text-[4.5rem]">{r.activity}</p>
        <p className="text-[#F7EAEC]">
          cards, answers and questions over {r.days} day{r.days === 1 ? "" : "s"}
          {r.change != null && r.change !== 0 && `, ${Math.abs(Math.round(r.change * 100))}% ${r.change > 0 ? "more" : "less"} than the week before`}.
        </p>
        <div className="mt-4 flex h-20 items-end gap-2" role="img" aria-label={`Each day: ${days.map((d) => totals.get(d)?.activity ?? 0).join(", ")}`}>
          {days.map((d) => (
            <div key={d} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-t-[4px] bg-white/85" style={{ height: `${Math.max(3, ((totals.get(d)?.activity ?? 0) / max) * 56)}px`, opacity: totals.get(d)?.activity ? 1 : 0.25 }} />
              <span className="text-[0.75rem] text-[#F7EAEC]">{dateFormat({ weekday: "narrow" }).format(new Date(`${d}T12:00:00`))}</span>
            </div>
          ))}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Cards", r.cards],
          ["Card recall", r.recallPct != null ? `${r.recallPct}%` : "–"],
          ["Quiz questions", r.questions],
          ["Quiz accuracy", r.quizPct != null ? `${r.quizPct}%` : "–"],
        ].map(([k, v]) => (
          <div key={k as string} className="card p-4"><dt className="text-[0.875rem] text-muted">{k}</dt><dd className="big-num text-[2rem]">{v}</dd></div>
        ))}
      </dl>

      {(r.bestDay || r.risingClass) && (
        <ul className="card mt-4 flex flex-col gap-2 p-5">
          {r.bestDay && <li><b>Best day:</b> {dateFormat({ weekday: "long" }).format(new Date(`${r.bestDay.day}T12:00:00`))}, with {r.bestDay.activity} studied.</li>}
          {r.risingClass && name(r.risingClass) && <li><b>Picked up:</b> {name(r.risingClass)} got more of your time than the week before.</li>}
        </ul>
      )}

      {lastWeekGoals.length > 0 && (
        <section className="card mt-4 p-5" aria-labelledby="recap-goals">
          <h2 id="recap-goals" className="mb-3 text-[1.25rem]">Goals: {r.goalsMet} of {r.goals}</h2>
          <ul className="flex flex-col gap-3">
            {lastWeekGoals.map(({ goal, value, pct, done }) => (
              <li key={goal.id} className="flex items-center gap-3">
                <GoalRing pct={pct} done={done} size={44} />
                <span className="flex-1"><b className="block">{goalName(goal, name(goal.subject_id))}</b><span className="text-[0.875rem] text-muted">{goalText(goal, value)}</span></span>
                {done ? <Check className="size-5 text-brand" aria-label="Met" /> : <X className="size-5 text-muted" aria-label="Not this time" />}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card card-dashed mt-4 p-5">
        <h2 className="text-[1.25rem]">This week</h2>
        <p className="mt-1">{r.next}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild><Link to="/progress">{r.goals ? "Check this week's goals" : "Set a goal"}</Link></Button>
          <Button asChild variant="secondary"><Link to={`/coach?say=${encodeURIComponent("Help me plan this week")}`}>Plan it with the coach</Link></Button>
        </div>
      </section>
    </section>
  );
}
