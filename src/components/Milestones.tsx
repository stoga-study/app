import { Award, X } from "lucide-react";
import { dateFormat } from "@/lib/locale";
import { useMarkMilestones, useMilestones } from "@/lib/queries/milestones";
import { cn } from "@/lib/cn";

/** Home: the newest milestone, quietly, until closed. Closing notes every new one, so they never pile up. */
export function MilestoneCard() {
  const m = useMilestones();
  const mark = useMarkMilestones();
  if (!m.ready || !m.fresh.length) return null;
  const top = [...m.fresh].sort((a, b) => b.order - a.order)[0];
  return (
    <section className="rise card mb-4 flex items-center gap-4 border-primary p-5" aria-label={`Milestone: ${top.title}`}>
      <span className="check-in grid size-12 flex-none place-items-center rounded-2xl bg-primary text-white"><Award className="size-6" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.8125rem] font-bold uppercase tracking-wide text-brand">Milestone</p>
        <p className="font-bold">{top.title}</p>
        <p className="text-[0.9375rem] text-muted">{top.detail}</p>
      </div>
      <button type="button" aria-label="Close" onClick={() => mark.mutate({ ids: m.fresh.map((x) => x.id), seen: m.seen })} className="grid size-10 flex-none place-items-center rounded-full hover:bg-soft"><X className="size-5" /></button>
    </section>
  );
}

/** Progress: milestones reached (with the day each was noticed) and the next few still ahead. */
export function MilestonesSection() {
  const m = useMilestones();
  if (!m.ready) return null;
  const reached = m.all.filter((x) => x.reached).sort((a, b) => b.order - a.order);
  const next = m.all.filter((x) => !x.reached).slice(0, 3);
  const fmt = dateFormat({ month: "short", day: "numeric" });
  return (
    <section className="card mt-4 p-6" aria-labelledby="milestones-h">
      <h2 id="milestones-h" className="text-[1.375rem]">Milestones</h2>
      {reached.length === 0 && <p className="mt-1 text-muted">A few quiet moments to mark along the way. Your first one comes with your first review.</p>}
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {reached.map((x) => (
          <li key={x.id} className="flex items-center gap-3 rounded-[1rem] bg-tint p-3">
            <span className="grid size-10 flex-none place-items-center rounded-xl bg-primary text-white"><Award className="size-5" /></span>
            <span className="min-w-0 flex-1"><b className="block">{x.title}</b><span className="text-[0.8125rem] text-muted">{m.seen[x.id] ? fmt.format(new Date(`${m.seen[x.id]}T12:00:00`)) : x.detail}</span></span>
          </li>
        ))}
        {next.map((x) => (
          <li key={x.id} className={cn("flex items-center gap-3 rounded-[1rem] border-2 border-dashed border-line p-3 text-muted")}>
            <span className="grid size-10 flex-none place-items-center rounded-xl bg-soft"><Award className="size-5" /></span>
            <span className="min-w-0 flex-1"><b className="block text-ink-2">{x.title}</b><span className="text-[0.8125rem]">Still ahead</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}
