import { FileText, Layers, ListChecks, NotebookPen, Search as SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/States";
import { highlightParts } from "@/lib/searchHighlight";
import { useSubjects } from "@/lib/queries/profile";
import { KIND_LABEL, useSearch, type SearchHit, type SearchKind } from "@/lib/queries/search";

const ICON: Record<SearchKind, typeof FileText> = { file: FileText, page: FileText, note: NotebookPen, card: Layers, question: ListChecks };
const ORDER: SearchKind[] = ["note", "file", "page", "card", "question"];

function hrefFor(h: SearchHit) {
  if (h.kind === "note") return `/notes/${h.id}`;
  if (h.kind === "file") return `/sources/${h.source_id}`;
  if (h.kind === "page") return h.page_no ? `/sources/${h.source_id}/view?page=${h.page_no}` : `/sources/${h.source_id}`;
  if (h.kind === "question") return h.extra_id ? `/quiz/${h.extra_id}` : `/subjects/${h.subject_id}/cards`;
  return `/subjects/${h.subject_id}/cards?q=${encodeURIComponent(h.title)}`;
}

function Snippet({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="mt-0.5 line-clamp-2 text-[0.9375rem] text-muted">{highlightParts(text).map((p, i) => (p.mark ? <mark key={i} className="rounded bg-tint px-0.5 text-ink">{p.text}</mark> : <span key={i}>{p.text}</span>))}</p>;
}

/** /search: one bar across files, pages, your own notes, cards and quiz questions. */
export default function Search() {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const subjects = useSubjects();
  const results = useSearch(query);

  // A short debounce: this fires a network call per keystroke otherwise.
  useEffect(() => {
    const t = setTimeout(() => setQuery(draft), 300);
    return () => clearTimeout(t);
  }, [draft]);

  const nameOf = (id: string) => subjects.data?.find((s) => s.id === id)?.name ?? "";
  const groups = ORDER.map((kind) => ({ kind, hits: (results.data ?? []).filter((h) => h.kind === kind) })).filter((g) => g.hits.length);

  return (
    <>
      <PageHeader title="Search">Everything in your account: files, pages, your own notes, cards and quiz questions.</PageHeader>
      <label htmlFor="search-q" className="sr-only">Search</label>
      <div className="relative mb-4">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          id="search-q"
          type="search"
          autoFocus
          className="input !pl-12"
          placeholder="Search your notes, cards, files…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </div>

      {draft.trim().length > 0 && draft.trim().length < 2 && <p className="text-muted">Keep typing.</p>}
      {results.isFetching && <div className="skeleton h-20 rounded-[1.25rem]" />}
      {results.isError && <p className="callout">We could not search right now. Check your connection, then try again.</p>}
      {query.length >= 2 && !results.isFetching && groups.length === 0 && (
        <EmptyState icon={<SearchIcon />} title="Nothing found">Try fewer or different words.</EmptyState>
      )}

      <div className="flex flex-col gap-6">
        {groups.map(({ kind, hits }) => {
          const Icon = ICON[kind];
          return (
            <section key={kind} aria-label={KIND_LABEL[kind]}>
              <h2 className="mb-2 text-[1.0625rem] text-muted">{KIND_LABEL[kind]} · {hits.length}</h2>
              <ul className="flex flex-col gap-2">
                {hits.map((h) => (
                  <li key={`${h.kind}-${h.id}-${h.page_no ?? ""}`}>
                    <Link to={hrefFor(h)} className="card flex items-start gap-3 p-4 text-ink no-underline">
                      <span className="tile soft !size-10 flex-none [&_svg]:!size-5"><Icon /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{h.title}{h.kind === "page" && <span className="font-normal text-muted"> · p. {h.page_no}</span>}</span>
                        <Snippet text={h.snippet} />
                        <span className="mt-1 block text-[0.8125rem] text-muted">{nameOf(h.subject_id)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
