import { BookOpen, Upload } from "lucide-react";
import { Link } from "react-router";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { LEVEL_LABEL, type Level } from "@/lib/catalog";
import { describeGrade } from "@/lib/grade";
import { currentSchoolYear } from "@/lib/catalog";
import { lastYearClasses, useAllSubjects, useProfile, useSubjects } from "@/lib/queries/profile";
import { useSources } from "@/lib/queries/sources";
import { sourceCount } from "./Subjects";
import { SUBJECT_TILE } from "@/lib/subjects";

function today() {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
}

export default function Home() {
  const profile = useProfile();
  const subjects = useSubjects();
  const all = useAllSubjects();
  const newYear = lastYearClasses(all.data).length > 0;
  const sources = useSources();
  const counts = new Map<string, number>();
  for (const s of sources.data ?? []) counts.set(s.subject_id, (counts.get(s.subject_id) ?? 0) + 1);
  const name = profile.data?.first_name;

  return (
    <>
      <PageHeader eyebrow={today()} title={name ? `Today, ${name}` : "Today"} />
      {newYear && (
        <Link to="/classes" className="callout mb-4 text-ink no-underline">
          <span><b>New school year.</b> Update your classes for {currentSchoolYear}. Last year&apos;s notes and cards stay safe.</span>
        </Link>
      )}
      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <section className="ink-panel burgundy p-6" aria-labelledby="due-title">
          <span className="circle circle-big right-[-4rem] top-[-5rem] size-56" aria-hidden="true" />
          <p id="due-title" className="text-[0.9375rem] text-[#F7EAEC]">Flashcards due today</p>
          <p className="big-num mt-1 text-[6rem]">0</p>
          <p className="mt-2 max-w-[22rem] text-[0.9375rem] text-[#F7EAEC]">Add notes and your first cards will appear here.</p>
        </section>
        <section className="card card-dashed flex flex-col justify-center gap-3 p-6">
          <span className="tile soft"><Upload /></span>
          <h2 className="text-[1.375rem]">Add notes or a PDF</h2>
          <p className="text-muted">We turn it into notes, flashcards, a practice quiz and a study guide, all linked to your pages.</p>
          <Button asChild className="self-start"><Link to="/upload"><Upload /> Add your first notes</Link></Button>
        </section>
      </div>

      <section className="mt-8" aria-labelledby="subjects-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="subjects-title" className="text-[1.375rem]">Your classes</h2>
            {profile.data?.graduation_year && <p className="text-[0.9375rem] text-muted">{describeGrade(profile.data.graduation_year)}</p>}
          </div>
          <Button asChild variant="secondary" size="sm"><Link to="/classes">Edit classes</Link></Button>
        </div>
        {subjects.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2">{[0, 1].map((i) => <div key={i} className="skeleton h-20 rounded-[1.5rem]" />)}</div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {subjects.data?.map((s) => (
              <li key={s.id}>
                <Link to={`/subjects/${s.id}`} className="card flex h-full items-center gap-4 p-4 text-ink no-underline">
                <span className={`tile ${SUBJECT_TILE[s.color_index] ?? ""} !size-11 !rounded-[0.8rem] [&_svg]:!size-5`}><BookOpen /></span>
                <div className="min-w-0">
                  {s.area && <p className="text-[0.8125rem] font-bold uppercase tracking-[0.05em] text-brand">{s.area}</p>}
                  <p className="truncate font-display text-[1.125rem] font-bold">{s.name}</p>
                  <p className="text-[0.875rem] text-muted">
                    {s.level ? `${LEVEL_LABEL[s.level as Level]} · ` : ""}{sourceCount(counts.get(s.id) ?? 0)}
                  </p>
                </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
