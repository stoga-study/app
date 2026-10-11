import { ArrowLeft, Check, Plus, Upload } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router";
import { PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { useCompleteOnboarding, useProfile } from "@/lib/queries/profile";
import { SUBJECT_PRESETS } from "@/lib/subjects";

type Picked = { name: string; area: string };

function Steps({ step }: { step: number }) {
  return (
    <div className="segments flex-1" role="img" aria-label={`Step ${step} of 2`}>
      <span className={step > 1 ? "done" : "now"} />
      <span className={step === 2 ? "now" : ""} />
    </div>
  );
}

export default function Onboarding() {
  const profile = useProfile();
  const complete = useCompleteOnboarding();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [firstName, setFirstName] = useState("");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [custom, setCustom] = useState("");

  if (profile.isPending) return <div className="mx-auto max-w-md p-6"><PageSkeleton /></div>;
  if (profile.data?.onboarded && step !== 3) return <Navigate to="/" replace />;

  const isPicked = (name: string) => picked.some((p) => p.name === name);
  const toggle = (s: Picked) => setPicked((cur) => (isPicked(s.name) ? cur.filter((p) => p.name !== s.name) : [...cur, s]));
  const extra = picked.filter((p) => !SUBJECT_PRESETS.some((s) => s.name === p.name));

  function addCustom(e: FormEvent) {
    e.preventDefault();
    const name = custom.trim().replace(/\s+/g, " ").slice(0, 80);
    if (name && !isPicked(name)) setPicked((cur) => [...cur, { name, area: "Other" }]);
    setCustom("");
  }

  async function finish() {
    await complete.mutateAsync({ firstName: firstName.trim().slice(0, 60), subjects: picked });
    setStep(3);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-8">
      {step === 1 && (
        <form className="flex flex-1 flex-col gap-6" onSubmit={(e) => { e.preventDefault(); setStep(2); }}>
          <div className="flex items-center gap-3"><Steps step={1} /></div>
          <div>
            <h1 className="text-[2rem]">What should we call you?</h1>
            <p className="mt-2 text-muted">Just a first name, so your day starts with it. You can skip this.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="first-name" className="field-label">First name</label>
            <input id="first-name" className="input" autoComplete="given-name" value={firstName} maxLength={60} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <Button type="submit" block className="mt-auto">{firstName.trim() ? "Continue" : "Skip for now"}</Button>
        </form>
      )}

      {step === 2 && (
        <div className="flex flex-1 flex-col gap-6">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setStep(1)} className="grid size-11 place-items-center rounded-full" aria-label="Back"><ArrowLeft className="size-5" /></button>
            <Steps step={2} />
          </div>
          <div>
            <h1 className="text-[2rem]">Which classes are you taking?</h1>
            <p className="mt-2 text-muted">Pick a few to start. You can add more any time.</p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Classes">
            {[...SUBJECT_PRESETS, ...extra].map((s) => (
              <button key={s.name} type="button" className="pill-option" aria-pressed={isPicked(s.name)} onClick={() => toggle(s)}>
                {isPicked(s.name) && <Check />}
                {s.name}
              </button>
            ))}
          </div>
          <form onSubmit={addCustom} className="flex gap-2">
            <label htmlFor="custom-class" className="sr-only">Add another class</label>
            <input id="custom-class" className="input" placeholder="Add another class" value={custom} maxLength={80} onChange={(e) => setCustom(e.target.value)} />
            <Button type="submit" variant="secondary" aria-label="Add class" disabled={!custom.trim()}><Plus /></Button>
          </form>
          {complete.isError && (
            <p role="alert" className="callout">We could not save your classes. Check your connection, then try again. Nothing was lost.</p>
          )}
          <Button block className="mt-auto" disabled={picked.length === 0 || complete.isPending} onClick={finish}>
            {complete.isPending ? "Saving…" : picked.length === 0 ? "Pick at least one class" : `Continue with ${picked.length}`}
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-1 flex-col gap-5">
          <div className="segments" role="img" aria-label="Setup complete"><span className="done" /><span className="done" /></div>
          <span className="chip self-start">Essential plan, free</span>
          <h1 className="pop text-[2rem]">
            {firstName.trim() ? `${firstName.trim()}, you` : "You"} are set up with {picked.length} {picked.length === 1 ? "subject" : "subjects"}
          </h1>
          <ul className="card divide-y divide-line px-4">
            {picked.map((s) => (
              <li key={s.name} className="flex items-center gap-3 py-3">
                <span className="grid size-6 place-items-center rounded-full bg-primary text-white"><Check className="size-3.5" /></span>
                {s.name}
                <span className="ml-auto text-[0.875rem] text-muted">{s.area}</span>
              </li>
            ))}
          </ul>
          <div className="card card-dashed p-4">
            <p className="font-bold">Next: add this week&apos;s notes</p>
            <p className="text-[0.9375rem] text-muted">Takes about a minute. Your first cards appear right after.</p>
          </div>
          <div className="mt-auto flex flex-col gap-3">
            <Button asChild block><Link to="/upload" replace><Upload /> Add notes</Link></Button>
            <Button asChild block variant="secondary"><Link to="/" replace>I will do it later</Link></Button>
          </div>
        </div>
      )}
    </main>
  );
}
