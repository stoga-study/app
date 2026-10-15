import { Flame, Pause, Play } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { addDays, today } from "@/lib/calendar";
import { dateFormat } from "@/lib/locale";
import { thisWeekStart, useStreak, useStreakSettings } from "@/lib/queries/streak";

const weekDays = () => Array.from({ length: 7 }, (_, i) => addDays(thisWeekStart(), i));

/** Seven dots for this week: filled where you studied, ringed for today. */
function WeekDots({ studied }: { studied: string[] }) {
  const now = today();
  return (
    <div className="flex gap-1.5" aria-hidden="true">
      {weekDays().map((d) => (
        <span key={d} className="flex flex-col items-center gap-1">
          <span className={cn("grid size-7 place-items-center rounded-full border-2 text-[0.75rem] font-bold", studied.includes(d) ? "border-primary bg-primary text-white" : d === now ? "border-primary text-brand" : "border-line text-muted", d > now && "opacity-50")}>
            {dateFormat({ weekday: "narrow" }).format(new Date(`${d}T12:00:00`))}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Home's streak card, only when streaks are on. */
export function StreakCard() {
  const s = useStreak();
  if (!s.ready || !s.on || !s.state) return null;
  const st = s.state;
  const studiedToday = st.studiedDays.includes(today());
  const label = `${st.current}-week streak. ${st.thisWeek} of ${st.target} days this week.`;
  return (
    <section className="card mb-4 flex flex-wrap items-center gap-4 p-5" aria-label={label}>
      <span className={cn("grid size-12 place-items-center rounded-2xl", st.current > 0 ? "bg-primary text-white" : "bg-tint text-brand")}><Flame className="size-6" /></span>
      <div className="min-w-[10rem] flex-1">
        <p className="font-bold">{st.current > 0 ? `${st.current}-week streak` : "Start a streak this week"}</p>
        <p className="text-[0.9375rem] text-muted">
          {st.paused ? "This week is paused. Rest up."
            : st.met ? `${st.thisWeek} of ${st.target} days. This week counts.`
              : st.outOfReach ? "This week won't count toward your streak, and that's okay."
                : `${st.thisWeek} of ${st.target} days this week`}
        </p>
      </div>
      <WeekDots studied={st.studiedDays} />
      {!studiedToday && !st.paused && !st.met && !st.outOfReach && (
        <Button asChild size="sm" className="w-full sm:w-auto"><Link to="/review/session?size=10">Commit to tonight's 10 minutes</Link></Button>
      )}
    </section>
  );
}

/** On Progress: turn streaks on or off, pick the days a week, see the best run, and pause a week. */
export function StreakSettings() {
  const s = useStreak();
  const save = useStreakSettings();
  const [pick, setPick] = useState(5);
  if (!s.ready) return null;
  const week = thisWeekStart();
  const paused = s.pauses.includes(week);
  const set = (patch: Parameters<typeof save.mutate>[0], msg: string) => save.mutate(patch, { onSuccess: () => toast(msg), onError: () => toast("We couldn't save that. Try again.") });
  return (
    <section className="card mt-4 p-6" aria-labelledby="streak-h">
      <h2 id="streak-h" className="flex items-center gap-2 text-[1.375rem]"><Flame className="size-5 text-brand" /> Streak</h2>
      {!s.on ? (
        <>
          <p className="mt-1 text-muted">Optional. Pick how many days a week you want to study. The other days are rest days, and a week you can't make never costs anything.</p>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Days a week">
            {[3, 4, 5, 6, 7].map((n) => <button key={n} type="button" role="radio" aria-checked={pick === n} className="pill-option" onClick={() => setPick(n)}>{n} days</button>)}
          </div>
          <Button className="mt-4" disabled={save.isPending} onClick={() => set({ streak_days: pick }, `Streak on: ${pick} days a week.`)}>Start my streak</Button>
        </>
      ) : (
        <>
          <p className="mt-1 text-muted">{s.target} days a week. Best run: {s.state?.best ?? 0} week{s.state?.best === 1 ? "" : "s"}.</p>
          <div className="mt-3"><WeekDots studied={s.state?.studiedDays ?? []} /></div>
          <div className="mt-4 flex flex-wrap gap-2">
            <label htmlFor="streak-days" className="sr-only">Days a week</label>
            <select id="streak-days" className="input !min-h-11 w-auto" value={s.target ?? 5} onChange={(e) => set({ streak_days: Number(e.target.value) }, "Saved.")}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} day{n === 1 ? "" : "s"} a week</option>)}
            </select>
            <Button variant="secondary" disabled={save.isPending} onClick={() => set({ streak_pauses: paused ? s.pauses.filter((p) => p !== week) : [...s.pauses, week].slice(-60) }, paused ? "This week is back on." : "This week is paused. Your streak is safe.")}>
              {paused ? <><Play /> Unpause this week</> : <><Pause /> Pause this week</>}
            </Button>
            <Button variant="ghost" disabled={save.isPending} onClick={() => set({ streak_days: null }, "Streak turned off.")}>Turn off</Button>
          </div>
        </>
      )}
    </section>
  );
}
