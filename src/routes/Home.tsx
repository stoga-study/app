import { ArrowRight, BookOpen, FileText, Layers, ListChecks, NotebookPen, Upload } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { LEVEL_LABEL, type Level } from "@/lib/catalog";
import { describeGrade } from "@/lib/grade";
import { currentSchoolYear } from "@/lib/catalog";
import { lastYearClasses, useAllSubjects, useProfile, useSubjects } from "@/lib/queries/profile";
import { joinNames, reviewMinutes, useDueCards } from "@/lib/queries/cards";
import { useDueQueue } from "@/lib/queries/review";
import { useSources } from "@/lib/queries/sources";
import { useSessionSize } from "@/lib/preferences";
import { useUnfinishedQuiz } from "@/lib/queries/quiz";
import { getRecent, type Recent } from "@/lib/recent";
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
  const due = useDueCards();
  const [size] = useSessionSize();
  // Fetch today's review queue in the background, so review works even if the connection drops.
  useDueQueue();
  const dueNames = Object.entries(due.data?.bySubject ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => subjects.data?.find((s) => s.id === id)?.name)
    .filter((n): n is string => !!n);
  const sourceTotal = sources.data?.length ?? 0;
  const nextDue = due.data?.nextDue
    ? new Intl.DateTimeFormat("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" }).format(new Date(due.data.nextDue))
    : null;

  return (
    <>
      <PageHeader eyebrow={today()} title={name ? `Today, ${name}` : "Today"} />
      {newYear && (
        <Link to="/classes" className="callout mb-4 text-ink no-underline">
          <span><b>New school year.</b> Update your classes for {currentSchoolYear}. Last year&apos;s notes and cards stay safe.</span>
        </Link>
      )}
      <ContinueStudying />
      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <section className="ink-panel burgundy p-6" aria-labelledby="due-title">
          <span className="circle circle-big right-[-4rem] top-[-5rem] size-56" aria-hidden="true" />
          <p id="due-title" className="text-[0.9375rem] text-[#F7EAEC]">Flashcards due today</p>
          <div className="mt-1 flex flex-wrap items-end gap-x-5 gap-y-2">
            <p className="big-num text-[6rem]">{due.isPending ? "–" : due.data?.count ?? 0}</p>
            <p className="max-w-[16rem] pb-2 text-[0.9375rem] text-[#F7EAEC]">
              {due.data && due.data.count > 0
                ? `${reviewMinutes(due.data.count)} across ${joinNames(dueNames)}.`
                : due.data && due.data.total > 0
                  ? `All caught up.${nextDue ? ` Next cards are due ${nextDue}.` : ""}`
                  : sourceTotal > 0
                    ? `${sourceTotal} ${sourceTotal === 1 ? "source is" : "sources are"} saved. Cards appear here once a study set is ready.`
                    : "Add notes and your first cards will appear here."}
            </p>
          </div>
          {due.data && due.data.count > 0 && (
            <Button asChild variant="inverse" block className="mt-4"><Link to={`/review/session?size=${size}`}>Start review</Link></Button>
          )}
        </section>
        <section className="card card-dashed flex flex-col justify-center gap-3 p-6">
          <span className="tile soft"><Upload /></span>
          <h2 className="text-[1.375rem]">Add notes or a PDF</h2>
          <p className="text-muted">Save it, then choose what to make: notes, flashcards, a practice quiz or a study guide, all linked to your pages.</p>
          <Button asChild className="self-start"><Link to="/upload"><Upload /> {(sources.data?.length ?? 0) > 0 ? "Add notes" : "Add your first notes"}</Link></Button>
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

const RECENT_ICON: Record<Recent["kind"] | "quiz", ReactNode> = { note: <NotebookPen />, file: <FileText />, review: <Layers />, quiz: <ListChecks /> };
const RECENT_WORD: Record<Recent["kind"] | "quiz", string> = { note: "Keep writing", file: "Back to your file", review: "Finish your review", quiz: "Finish your quiz" };

/** One thing to pick back up: a quiz left part-way (any device), or the last note, file or review here. */
function ContinueStudying() {
  const quiz = useUnfinishedQuiz();
  const [recent] = useState(getRecent);
  const q = quiz.data;
  const pick: (Omit<Recent, "kind"> & { kind: Recent["kind"] | "quiz" }) | null =
    q && (!recent || new Date(q.at).getTime() >= recent.at)
      ? { kind: "quiz", href: `/quiz/${q.quizId}?attempt=${q.attemptId}`, label: q.title, sub: `Question ${q.done + 1} of ${q.total}`, at: new Date(q.at).getTime() }
      : recent;
  if (!pick) return null;
  return (
    <section className="mb-4" aria-labelledby="continue-title">
      <Link to={pick.href} className="card flex items-center gap-4 p-4 text-ink no-underline">
        <span className="tile soft">{RECENT_ICON[pick.kind]}</span>
        <span className="min-w-0 flex-1">
          <span id="continue-title" className="block text-[0.8125rem] font-bold uppercase tracking-[0.05em] text-brand">Continue studying · {RECENT_WORD[pick.kind]}</span>
          <span className="block truncate font-display text-[1.125rem] font-bold">{pick.label}</span>
          {pick.sub && <span className="block truncate text-[0.875rem] text-muted">{pick.sub}</span>}
        </span>
        <ArrowRight className="size-5 flex-none text-brand" aria-hidden="true" />
      </Link>
    </section>
  );
}
