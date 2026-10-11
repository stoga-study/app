import { BookOpen, Upload } from "lucide-react";
import { Link } from "react-router";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { LEVEL_LABEL, type Level } from "@/lib/catalog";
import { useSubjects } from "@/lib/queries/profile";
import { useSources } from "@/lib/queries/sources";
import { SUBJECT_TILE } from "@/lib/subjects";

export function sourceCount(n: number) {
  return n === 0 ? "No material yet" : `${n} ${n === 1 ? "source" : "sources"}`;
}

export default function Subjects() {
  const subjects = useSubjects();
  const sources = useSources();
  if (subjects.isPending) return <PageSkeleton />;
  const counts = new Map<string, number>();
  for (const s of sources.data ?? []) counts.set(s.subject_id, (counts.get(s.subject_id) ?? 0) + 1);

  return (
    <>
      <PageHeader title="Subjects" end={<Button asChild variant="secondary" size="sm"><Link to="/classes">Edit classes</Link></Button>} />
      {subjects.data!.length === 0 ? (
        <EmptyState icon={<BookOpen />} title="No classes yet" action={<Button asChild><Link to="/classes">Choose your classes</Link></Button>}>
          Pick your classes, then add notes to each one.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {subjects.data!.map((s) => (
            <li key={s.id}>
              <Link to={`/subjects/${s.id}`} className="card flex h-full items-center gap-4 p-4 text-ink no-underline">
                <span className={`tile ${SUBJECT_TILE[s.color_index] ?? ""} !size-11 !rounded-[0.8rem] [&_svg]:!size-5`}><BookOpen /></span>
                <span className="min-w-0">
                  {s.area && <span className="block text-[0.8125rem] font-bold uppercase tracking-[0.05em] text-brand">{s.area}</span>}
                  <span className="block truncate font-display text-[1.125rem] font-bold">{s.name}</span>
                  <span className="block text-[0.875rem] text-muted">
                    {s.level ? `${LEVEL_LABEL[s.level as Level]} · ` : ""}{sourceCount(counts.get(s.id) ?? 0)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {subjects.data!.length > 0 && (
        <Button asChild className="mt-6"><Link to="/upload"><Upload /> Add notes</Link></Button>
      )}
    </>
  );
}
