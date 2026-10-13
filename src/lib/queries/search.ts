import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
import { supabase } from "../supabase";

export type SearchKind = "file" | "page" | "note" | "card" | "question";
export type SearchHit = {
  kind: SearchKind;
  id: string;
  subject_id: string;
  title: string;
  snippet: string | null;
  source_id: string | null;
  extra_id: string | null;
  page_no: number | null;
  rank: number;
};

/** One search bar across files, pages, your own notes, cards and quiz questions. */
export function useSearch(query: string, subjectId?: string | null) {
  const { session } = useAuth();
  const q = query.trim();
  return useQuery({
    queryKey: ["search", session?.user.id, q, subjectId ?? "all"],
    enabled: !!session && q.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_everything", { p_query: q, p_subject: subjectId ?? undefined, p_limit: 8 });
      if (error) throw error;
      return (data as SearchHit[]).sort((a, b) => b.rank - a.rank || a.kind.localeCompare(b.kind));
    },
  });
}

export const KIND_LABEL: Record<SearchKind, string> = { file: "Files", page: "Pages", note: "My notes", card: "Cards", question: "Quiz questions" };
