import { Check, Minus, Plus, Target, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { GOAL_KINDS, goalName, goalText, type Goal, type GoalKind } from "@/lib/goals";
import { useGoalActions, useGoals } from "@/lib/queries/goals";
import { useSubjects } from "@/lib/queries/profile";
import { shortDate } from "@/lib/calendar";

/** A progress ring; a check in the middle once the goal is met. */
export function GoalRing({ pct, done, size = 56 }: { pct: number; done: boolean; size?: number }) {
  const r = 20, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className="flex-none -rotate-90" aria-hidden="true">
      <circle cx={24} cy={24} r={r} fill="none" stroke="var(--line)" strokeWidth={5} />
      <circle cx={24} cy={24} r={r} fill="none" stroke="var(--primary)" strokeWidth={5} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} className="transition-[stroke-dashoffset] duration-700 ease-out" />
      {done && <path d="M17 24 l5 5 l9 -10" transform="rotate(90 24 24)" fill="none" stroke="var(--primary)" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" className="check-in" />}
    </svg>
  );
}

function AddGoal({ onDone }: { onDone: () => void }) {
  const subjects = useSubjects();
  const { add } = useGoalActions();
  const [kind, setKind] = useState<GoalKind>("days");
  const meta = GOAL_KINDS.find((k) => k.kind === kind)!;
  const [target, setTarget] = useState(meta.presets[1]);
  const [subject, setSubject] = useState("");
  const [label, setLabel] = useState("");
  const pick = (k: GoalKind) => {
    setKind(k);
    setTarget(GOAL_KINDS.find((x) => x.kind === k)!.presets[1]);
  };
  const preview: Goal = { id: "new", kind, target, label: label.trim() || "My goal", subject_id: subject || null };
  return (
    <form
      className="flex flex-col gap-4 rounded-[1rem] border-2 border-line p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (kind === "custom" && !label.trim()) return;
        add.mutate(
          { kind, target, label: kind === "custom" ? label.trim().slice(0, 60) : null, subject_id: kind === "custom" ? null : subject || null },
          { onSuccess: onDone, onError: (err) => toast(String((err as { message?: string }).message).includes("goal_limit") ? "You can have four goals at a time." : "We couldn't add that goal. Try again.") },
        );
      }}
    >
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kind of goal">
        {GOAL_KINDS.map((k) => <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind} className="pill-option" onClick={() => pick(k.kind)}>{k.label}</button>)}
      </div>
      {kind === "custom" && (
        <div>
          <label htmlFor="goal-label" className="mb-1 block font-bold">What's the goal?</label>
          <input id="goal-label" className="input w-full" maxLength={60} placeholder="Read a chapter, practise Spanish…" value={label} onChange={(e) => setLabel(e.target.value)} required />
        </div>
      )}
      <div>
        <p className="mb-1 font-bold">{kind === "custom" ? "Times a week" : "Each week"}</p>
        <div className="flex flex-wrap items-center gap-2">
          {meta.presets.map((n) => <button key={n} type="button" aria-pressed={target === n} className="pill-option" onClick={() => setTarget(n)}>{n}</button>)}
          <label className="sr-only" htmlFor="goal-n">Number</label>
          <input id="goal-n" type="number" min={1} max={kind === "days" ? 7 : 10000} className="input !min-h-11 w-24" value={target} onChange={(e) => setTarget(Math.max(1, Math.min(kind === "days" ? 7 : 10000, Number(e.target.value) || 1)))} />
        </div>
      </div>
      {kind !== "custom" && (subjects.data?.length ?? 0) > 0 && (
        <div>
          <label htmlFor="goal-class" className="mb-1 block font-bold">Class <span className="font-normal text-muted">(optional)</span></label>
          <select id="goal-class" className="input w-full max-w-sm" value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">All classes</option>
            {subjects.data!.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      <p className="text-[0.9375rem] text-muted">Goal: <b className="text-ink">{goalName(preview, subjects.data?.find((s) => s.id === subject)?.name)}</b> each week.</p>
      <div className="flex gap-2">
        <Button type="submit" disabled={add.isPending}>Add goal</Button>
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

/** This week's goals with rings, ticks for custom ones, and adding or removing goals. */
export function GoalsSection() {
  const g = useGoals();
  const subjects = useSubjects();
  const { remove, tick } = useGoalActions();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  if (!g.ready) return <div className="skeleton mt-4 h-32 rounded-[1.5rem]" />;
  const name = (id: string | null) => subjects.data?.find((s) => s.id === id)?.name ?? null;
  return (
    <section className="card mt-4 p-6" aria-labelledby="goals-h">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="goals-h" className="text-[1.375rem]">This week's goals</h2>
        <span className="text-[0.875rem] text-muted">{shortDate(g.week.start)} to {shortDate(g.week.end)}</span>
      </div>
      {g.goals.length === 0 && !adding && (
        <div className="flex flex-wrap items-center gap-4">
          <span className="tile soft"><Target /></span>
          <p className="min-w-[12rem] flex-1 text-muted">Pick a goal that feels doable. It resets every week, and missing one is fine.</p>
          <Button variant="secondary" onClick={() => setAdding(true)}><Plus /> Set a goal</Button>
        </div>
      )}
      {g.goals.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {g.goals.map(({ goal, value, pct, done }) => {
            const myTicks = (g.ticks[goal.id] ?? []).filter((t) => t.day >= g.week.start);
            return (
              <li key={goal.id} className={cn("flex items-center gap-3 rounded-[1rem] border-2 p-3", done ? "border-primary bg-tint" : "border-line")}>
                <GoalRing pct={pct} done={done} />
                <span className="min-w-0 flex-1">
                  <b className="block">{goalName(goal, name(goal.subject_id))}</b>
                  <span className="text-[0.875rem] text-muted tabular">{done ? "Done this week" : goalText(goal, value)}</span>
                </span>
                {goal.kind === "custom" && !editing && (
                  <span className="flex gap-1">
                    {myTicks.length > 0 && <Button size="sm" variant="ghost" aria-label={`Take back one: ${goal.label}`} onClick={() => tick.mutate({ goalId: goal.id, undoId: myTicks.at(-1)!.id })}><Minus /></Button>}
                    <Button size="sm" variant="secondary" aria-label={`Did it: ${goal.label}`} onClick={() => tick.mutate({ goalId: goal.id })}><Plus /></Button>
                  </span>
                )}
                {editing && <Button size="sm" variant="ghost" aria-label={`Remove goal: ${goalName(goal, name(goal.subject_id))}`} onClick={() => remove.mutate(goal.id)}><Trash2 /></Button>}
              </li>
            );
          })}
        </ul>
      )}
      {adding ? (
        <div className="mt-3"><AddGoal onDone={() => setAdding(false)} /></div>
      ) : g.goals.length > 0 && (
        <div className="mt-3 flex gap-2">
          {g.goals.length < 4 && !editing && <Button size="sm" variant="ghost" onClick={() => setAdding(true)}><Plus /> Add a goal</Button>}
          <Button size="sm" variant="ghost" onClick={() => setEditing((x) => !x)}>{editing ? <><Check /> Done</> : "Edit goals"}</Button>
        </div>
      )}
    </section>
  );
}

/** A compact row of this week's goals for Home. */
export function GoalsStrip() {
  const g = useGoals();
  const subjects = useSubjects();
  if (!g.ready || !g.goals.length) return null;
  const name = (id: string | null) => subjects.data?.find((s) => s.id === id)?.name ?? null;
  return (
    <Link to="/progress" className="card mb-4 flex flex-wrap items-center gap-x-5 gap-y-3 p-4 text-ink no-underline" aria-label="This week's goals">
      {g.goals.map(({ goal, value, pct, done }) => (
        <span key={goal.id} className="flex min-w-[10rem] flex-1 items-center gap-2">
          <GoalRing pct={pct} done={done} size={40} />
          <span className="min-w-0"><b className="block truncate text-[0.9375rem]">{goalName(goal, name(goal.subject_id))}</b><span className="text-[0.8125rem] text-muted tabular">{done ? "Done" : goalText(goal, value)}</span></span>
        </span>
      ))}
    </Link>
  );
}

/** Home's weekly recap card: the first three days of each week, until closed. */
export function RecapCard({ onClose }: { onClose: () => void }) {
  const g = useGoals();
  if (!g.recap) return null;
  const r = g.recap;
  if (!r.activity && !r.goals) return null;
  return (
    <section className="ink-panel mb-4 p-5" aria-labelledby="recap-h">
      <span className="circle circle-big right-[-4rem] top-[-5rem] size-48" aria-hidden="true" />
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="ink-muted text-[0.875rem]">{shortDate(r.week.start)} to {shortDate(r.week.end)}</p>
          <h2 id="recap-h" className="text-[1.375rem]">Your week in review</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close the recap" className="grid size-10 place-items-center rounded-full hover:bg-white/10"><X className="size-5" /></button>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {[["Studied", r.activity], ["Days", r.days], ["Goals", r.goals ? `${r.goalsMet}/${r.goals}` : "–"]].map(([k, v]) => (
          <div key={k as string}><dt className="ink-muted text-[0.8125rem]">{k}</dt><dd className="big-num text-[2rem]">{v}</dd></div>
        ))}
      </dl>
      <p className="mt-2 text-[0.9375rem]">{r.next}</p>
      <Button asChild variant="inverse" size="sm" className="mt-3"><Link to="/recap">See your whole week</Link></Button>
    </section>
  );
}
