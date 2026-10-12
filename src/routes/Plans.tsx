import { Check, Heart, KeyRound, Plug } from "lucide-react";
import { Link } from "react-router";
import { PageHeader } from "@/components/PageHeader";
import { PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/lib/queries/profile";
import { useAllowance } from "@/lib/queries/sources";

const PLANS = [
  { id: "essential", name: "Essential", price: "Free", desc: "Normal study usage for a full course load.", points: ["50 tutor messages a day", "10 study sets a month (saving files is free)", "Every feature, same quality of answers"] },
  { id: "independent", name: "Independent", price: "Free, plus provider fees", desc: "Bring your own key for any OpenAI-compatible API. Your provider bills the key holder.", points: ["No Stoga.study limits", "Set a spending cap with your provider", "Remove the key any time"] },
  { id: "unlimited", name: "Unlimited", price: "$10 a month", desc: "Heavy use with plain-language fair use. Helps keep Essential free.", points: ["No daily or monthly caps", "A parent or guardian pays", "We email before limiting anything"] },
] as const;

const fmt = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(new Date(iso));

function Meter({ label, used, limit, note }: { label: string; used: number; limit: number | null; note: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3"><span>{label}</span><b className="tabular">{limit == null ? "No limit" : `${used} of ${limit}`}</b></div>
      {limit != null && <div className="bar mt-2" role="img" aria-label={`${label}: ${used} of ${limit}`}><span style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} /></div>}
      <p className="mt-1 text-[0.8125rem] text-muted">{note}</p>
    </div>
  );
}

export default function Plans() {
  const profile = useProfile();
  const allowance = useAllowance();
  if (profile.isPending || allowance.isPending) return <PageSkeleton />;
  const plan = profile.data?.plan ?? "essential";
  const tutor = allowance.data?.tutor_message, uploads = allowance.data?.upload;

  return (
    <>
      <PageHeader title="Plans and funding">Studying is free here. Every plan gets the same features and the same quality of answers.</PageHeader>

      <section className="card mb-6 flex flex-col gap-5 p-5" aria-labelledby="allow">
        <h2 id="allow" className="text-[1.25rem]">Your allowance</h2>
        {tutor && <Meter label="Tutor messages today" used={tutor.used} limit={tutor.limit} note={`Resets at midnight.`} />}
        {uploads && <Meter label="Study sets this month" used={uploads.used} limit={uploads.limit} note={`Resets on ${fmt(uploads.resetsAt)}.`} />}
        <p className="text-[0.9375rem] text-muted">At a limit, your cards, notes and quizzes still work. Only new tutor answers and study sets wait. You can still save files.</p>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => {
          const current = p.id === plan;
          return (
            <article key={p.id} className={`card flex flex-col gap-3 p-5 ${current ? "!border-primary !shadow-[0_4px_0_var(--primary)]" : ""}`} aria-labelledby={`plan-${p.id}`}>
              <div className="flex items-start justify-between gap-2">
                <h2 id={`plan-${p.id}`} className="text-[1.375rem]">{p.name}</h2>
                {current && <span className="chip chip-solid">Your plan</span>}
              </div>
              <p className="font-display text-[1.375rem] font-bold text-brand">{p.price}</p>
              <p className="text-muted">{p.desc}</p>
              <ul className="flex flex-col gap-2 text-[0.9375rem]">
                {p.points.map((pt) => <li key={pt} className="flex gap-2"><Check className="mt-0.5 size-4 flex-none text-brand" />{pt}</li>)}
              </ul>
              <div className="mt-auto pt-2">
                {p.id === "independent" && !current && <Button asChild variant="secondary" block><Link to="/settings#own-key"><KeyRound /> Add your key</Link></Button>}
                {p.id === "independent" && current && <Button asChild variant="secondary" block><Link to="/settings#own-key">Manage your key</Link></Button>}
                {p.id === "unlimited" && <span className="label-backend inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-line-strong px-3 py-1 text-[0.8125rem] font-bold text-muted"><Plug className="size-4" /> Checkout is not live yet</span>}
              </div>
            </article>
          );
        })}
      </div>

      <section className="ink-panel burgundy mt-6 p-6" aria-labelledby="funding">
        <span className="circle circle-big right-[-5rem] top-[-6rem] size-60" aria-hidden="true" />
        <p className="chip chip-dark">Sample figures until launch</p>
        <h2 id="funding" className="mt-3 text-[1.5rem]">Free for every student, kept going by the Stoga community</h2>
        <p className="mt-2 max-w-xl text-[#F7EAEC]">Unlimited plans and optional donations cover the AI costs. We publish every month's costs and funding on stoga.study, so you can see exactly where the money goes.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="inverse"><a href="https://stoga.study/plans#funding" target="_blank" rel="noopener"><Heart /> See funding</a></Button>
        </div>
        <p className="mt-3 text-[0.8125rem] text-[#F7EAEC]">Donations open once payments are connected.</p>
      </section>
    </>
  );
}
