import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { MathText } from "@/components/MathText";
import { PageChips } from "@/components/PageChips";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { useSubjects } from "@/lib/queries/profile";
import { useMistakes } from "@/lib/queries/quiz";

/** Questions to revisit, grouped by topic. Never framed as failure. */
export default function Mistakes() {
  const mistakes = useMistakes();
  const subjects = useSubjects();
  const [topic, setTopic] = useState<string | null>(null);
  if (mistakes.isPending) return <PageSkeleton label="Gathering questions to revisit." />;
  if (mistakes.isError) return <ErrorState title="We could not load mistake review" onRetry={() => mistakes.refetch()}>Check your connection, then try again.</ErrorState>;
  const all = mistakes.data;
  const topics = [...all.reduce((m, x) => m.set(x.question.topic || "Other", (m.get(x.question.topic || "Other") ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const shown = all.filter((m) => !topic || (m.question.topic || "Other") === topic);
  const subjectName = (id: string) => subjects.data?.find((s) => s.id === id)?.name;

  return (
    <>
      <PageHeader eyebrow={`${all.length} ${all.length === 1 ? "question" : "questions"} to revisit`} title="Mistake review">
        Questions you missed in quizzes. Get one right and it leaves this list.
      </PageHeader>
      {all.length === 0 ? (
        <EmptyState icon={<RotateCcw />} title="Nothing to revisit" action={<Button asChild><Link to="/review">Take a practice quiz</Link></Button>}>
          Questions you miss in a quiz appear here, so you can try them again later.
        </EmptyState>
      ) : (
        <>
          <div className="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" role="group" aria-label="Topics">
            <button type="button" className="pill-option flex-none" aria-pressed={topic === null} onClick={() => setTopic(null)}>All <span className="font-normal tabular">{all.length}</span></button>
            {topics.map(([t, n]) => (
              <button key={t} type="button" className="pill-option flex-none" aria-pressed={topic === t} onClick={() => setTopic(t)}>{t} <span className="font-normal tabular">{n}</span></button>
            ))}
          </div>
          <Button asChild className="mb-4"><Link to={`/quiz/mistakes${topic ? `?topic=${encodeURIComponent(topic)}` : ""}`}><RotateCcw /> Practice {topic ? `these ${shown.length}` : "all"}</Link></Button>
          <ul className="flex flex-col gap-3">
            {shown.map((m) => (
              <li key={m.id} className="card p-5">
                <p className="text-[0.8125rem] font-bold text-muted">{[subjectName(m.question.subject_id), m.question.topic].filter(Boolean).join(" · ")}</p>
                <p className="mt-1 font-display text-[1.125rem] font-bold"><MathText text={m.question.prompt} /></p>
                {m.chosen_index !== null && m.question.options[m.chosen_index] && (
                  <p className="mt-2 text-[0.9375rem] text-muted">You chose: <MathText text={m.question.options[m.chosen_index]} /></p>
                )}
                <PageChips pages={m.question.pages} kind={m.question.kind} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
