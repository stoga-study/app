import { ArrowLeft, Check, Upload } from "lucide-react";
import { useState } from "react";
import { Link, Navigate } from "react-router";
import { ClassPicker } from "@/components/ClassPicker";
import { GradePicker } from "@/components/GradePicker";
import { PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { findCourse, findSection, LEVEL_LABEL, type Picks } from "@/lib/catalog";
import { GRADE_NAME, gradeFor, graduationYearFor, type Grade } from "@/lib/grade";
import { picksFrom, useAllSubjects, useProfile, useSaveClasses } from "@/lib/queries/profile";

type Step = "name" | "grade" | "classes" | "done";

function Steps({ step, total, onBack }: { step: number; total: number; onBack?: () => void }) {
  return (
    <div className="flex items-center gap-3">
      {onBack && (
        <button type="button" onClick={onBack} className="grid size-11 place-items-center rounded-full" aria-label="Back">
          <ArrowLeft className="size-5" />
        </button>
      )}
      <div className="segments flex-1" role="img" aria-label={`Step ${step} of ${total}`}>
        {Array.from({ length: total }, (_, i) => <span key={i} className={i + 1 < step ? "done" : i + 1 === step ? "now" : ""} />)}
      </div>
    </div>
  );
}

export default function Onboarding() {
  const profile = useProfile();
  const subjects = useAllSubjects();
  const save = useSaveClasses();
  const [step, setStep] = useState<Step | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [picks, setPicks] = useState<Picks | null>(null);

  if (profile.isPending || subjects.isPending) return <div className="mx-auto max-w-md p-6"><PageSkeleton /></div>;
  const p = profile.data!;
  const currentGrade = gradeFor(p.graduation_year);
  if (p.onboarded && currentGrade && step !== "done") return <Navigate to="/" replace />;

  // Students who finished the old onboarding only need their grade and classes.
  const returning = p.onboarded;
  const stepNow: Step = step ?? (returning ? "grade" : "name");
  const name = firstName ?? p.first_name ?? "";
  const g = grade ?? currentGrade;
  const chosen = picks ?? picksFrom(subjects.data);
  const total = returning ? 2 : 3;
  const num = { name: 1, grade: returning ? 1 : 2, classes: returning ? 2 : 3, done: total } as const;
  const pickCount = Object.keys(chosen).length;
  const missingLevel = Object.entries(chosen).find(([, code]) => !code);
  const missingWord = missingLevel && findCourse(missingLevel[0])?.sections.some((s) => s.track) ? "version" : "level";

  async function finish() {
    await save.mutateAsync({ picks: chosen, graduationYear: graduationYearFor(g!), firstName: name, finishOnboarding: true });
    setStep("done");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-8">
      {stepNow === "name" && (
        <form className="flex flex-1 flex-col gap-6" onSubmit={(e) => { e.preventDefault(); setStep("grade"); }}>
          <Steps step={num.name} total={total} />
          <div>
            <h1 className="text-[2rem]">What should we call you?</h1>
            <p className="mt-2 text-muted">Just a first name, so your day starts with it. You can skip this.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="first-name" className="field-label">First name</label>
            <input id="first-name" className="input" autoComplete="given-name" value={name} maxLength={60} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <Button type="submit" block className="mt-auto">{name.trim() ? "Continue" : "Skip for now"}</Button>
        </form>
      )}

      {stepNow === "grade" && (
        <div className="flex flex-1 flex-col gap-6">
          <Steps step={num.grade} total={total} onBack={returning ? undefined : () => setStep("name")} />
          <div>
            <h1 className="text-[2rem]">What grade are you in?</h1>
            <p className="mt-2 text-muted">We show the classes Conestoga offers for your grade. It moves up on its own each school year.</p>
          </div>
          <GradePicker value={g} onChange={setGrade} />
          <Button block className="mt-auto" disabled={!g} onClick={() => setStep("classes")}>
            {g ? `Continue as a ${GRADE_NAME[g].toLowerCase()}` : "Choose your grade"}
          </Button>
        </div>
      )}

      {stepNow === "classes" && (
        <div className="flex flex-1 flex-col gap-6">
          <Steps step={num.classes} total={total} onBack={() => setStep("grade")} />
          <div>
            <h1 className="text-[2rem]">Which classes are you taking?</h1>
            <p className="mt-2 text-muted">Core classes from the 2026–27 Program of Studies. Pick yours and their levels. You can change them any time.</p>
          </div>
          <ClassPicker grade={g} value={chosen} onChange={setPicks} />
          <div className="sticky bottom-0 -mx-5 flex flex-col gap-2 border-t border-line bg-bg px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {save.isError && <p role="alert" className="callout">We could not save your classes. Check your connection, then try again. Nothing was lost.</p>}
            {missingLevel && <p className="text-center text-[0.875rem] font-bold text-brand">Choose a {missingWord} for {findCourse(missingLevel[0])?.title}.</p>}
            <Button block disabled={pickCount === 0 || !!missingLevel || save.isPending} onClick={finish}>
              {save.isPending ? "Saving…" : pickCount === 0 ? "Pick at least one class" : `Continue with ${pickCount} ${pickCount === 1 ? "class" : "classes"}`}
            </Button>
          </div>
        </div>
      )}

      {stepNow === "done" && (
        <div className="flex flex-1 flex-col gap-5">
          <div className="segments" role="img" aria-label="Setup complete">{Array.from({ length: total }, (_, i) => <span key={i} className="done" />)}</div>
          <span className="chip self-start">Essential plan, free</span>
          <h1 className="pop text-[2rem]">
            {name.trim() ? `${name.trim()}, you` : "You"} are set up with {pickCount} {pickCount === 1 ? "class" : "classes"}
          </h1>
          <ul className="card divide-y divide-line px-4">
            {Object.entries(chosen).map(([id, code]) => {
              const course = findCourse(id);
              const s = course && findSection(course, code);
              return (
                <li key={id} className="flex items-center gap-3 py-3">
                  <span className="grid size-6 flex-none place-items-center rounded-full bg-primary text-white"><Check className="size-3.5" /></span>
                  <span className="min-w-0 flex-1">{s?.name ?? course?.title}</span>
                  {s?.level && <span className="chip !min-h-6 !text-[0.8125rem]">{LEVEL_LABEL[s.level]}</span>}
                </li>
              );
            })}
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
