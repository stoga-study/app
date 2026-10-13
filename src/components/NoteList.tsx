import { ChevronRight, NotebookPen } from "lucide-react";
import { Link } from "react-router";
import { notePreview, noteTitle } from "@/lib/noteEdit";
import type { NoteSummary } from "@/lib/queries/notes";

const fmt = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));

/** Your own notes, as rows like files have. */
export function NoteList({ notes }: { notes: NoteSummary[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {notes.map((n) => (
        <li key={n.id}>
          <Link to={`/notes/${n.id}`} className="card flex items-center gap-4 p-4 text-ink no-underline">
            <span className="tile soft"><NotebookPen /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{noteTitle(n)}</span>
              <span className="block truncate text-[0.875rem] text-muted">My notes · edited {fmt(n.updated_at)}{notePreview(n.body) && ` · ${notePreview(n.body)}`}</span>
            </span>
            <ChevronRight className="size-5 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
