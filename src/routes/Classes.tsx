import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ClassPicker } from "@/components/ClassPicker";
import { GradePicker } from "@/components/GradePicker";
import { PageHeader } from "@/components/PageHeader";
import { ErrorState, PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { catalog, findCourse, type Picks } from "@/lib/catalog";
import { describeGrade, gradeFor, graduationYearFor, type Grade } from "@/lib/grade";
import { picksFrom, useAllSubjects, useArchiveSubject, useProfile, useSaveClasses } from "@/lib/queries/profile";

const same = (a: Picks, b: Picks) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
};

/** "Your classes": change grade, add or drop classes, or switch levels after a course change. */
export default function Classes() {
  const profile = useProfile();
  const subjects = useAllSubjects();
  const save = useSaveClasses();
  const archive = useArchiveSubject();
  const [grade, setGrade] = useState<Grade | null>(null);
  const [picks, setPicks] = useState<Picks | null>(null);
  const [editGrade, setEditGrade] = useState(false);

  const saved = picksFrom(subjects.data);
  const savedGrade = gradeFor(profile.data?.graduation_year);
  const g = grade ?? savedGrade;
  const current = picks ?? saved;
  const dirty = !same(current, saved) || (g !== null && g !== savedGrade);
  const missing = Object.entries(current).find(([, code]) => !code);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (profile.isPending || subjects.isPending) return <PageSkeleton label="Loading your classes." />;
  if (profile.isError || subjects.isError)
    return <ErrorState title="We could not load your classes" onRetry={() => { profile.refetch(); subjects.refetch(); }}>Check your connection, then try again.</ErrorState>;

  const legacy = subjects.data!.filter((s) => !s.catalog_id && !s.archived);

  async function onSave() {
    try {
      await save.mutateAsync({ picks: current, graduationYear: graduationYearFor(g!) });
      setPicks(null);
      setGrade(null);
      setEditGrade(false);
      toast("Your classes are updated. Dropped classes keep their notes and cards.");
    } catch {
      toast("We could not save your changes. Check your connection, then try again. Nothing was lost.");
    }
  }

  return (
    <>
      <PageHeader eyebrow={g ? describeGrade(graduationYearFor(g)) : "Grade not set"} title="Your classes">
        Core classes from the Conestoga {catalog.schoolYear} Program of Studies. Changed a class or level? Update it here.
      </PageHeader>

      <section className="card mb-6 flex flex-col gap-4 p-5" aria-labelledby="grade-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="grade-title" className="text-[1.25rem]">Grade</h2>
            <p className="text-muted">{g ? describeGrade(graduationYearFor(g)) : "Choose your grade to see your classes."}</p>
          </div>
          {!editGrade && g && <Button variant="secondary" size="sm" onClick={() => setEditGrade(true)}>Change grade</Button>}
        </div>
        {(editGrade || !g) && <GradePicker value={g} onChange={(next) => { setGrade(next); setEditGrade(false); }} />}
      </section>

      <ClassPicker grade={g} value={current} onChange={setPicks} />

      {legacy.length > 0 && (
        <section className="mt-8" aria-labelledby="other-title">
          <h2 id="other-title" className="eyebrow mb-2">Other subjects</h2>
          <ul className="flex flex-col gap-2">
            {legacy.map((s) => (
              <li key={s.id} className="card flex items-center gap-3 !shadow-none p-4">
                <span className="flex-1 font-bold">{s.name}</span>
                <Button variant="ghost" size="sm" disabled={archive.isPending} onClick={() => archive.mutate(s.id)}>Remove</Button>
              </li>
            ))}
          </ul>
          <p className="field-hint mt-2">Removing a subject keeps its notes and cards.</p>
        </section>
      )}

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mt-6 lg:bottom-4">
        {dirty && (
          <div className="card sheet-in flex flex-wrap items-center gap-3 p-3">
            <p className="flex-1 pl-2 text-[0.9375rem] font-bold">
              {missing ? `Choose a level for ${findCourse(missing[0])?.title}.` : "You have unsaved changes."}
            </p>
            <Button variant="secondary" size="sm" onClick={() => { setPicks(null); setGrade(null); }}>Undo</Button>
            <Button size="sm" disabled={!!missing || !g || save.isPending} onClick={onSave}>{save.isPending ? "Saving…" : "Save changes"}</Button>
          </div>
        )}
      </div>
    </>
  );
}
