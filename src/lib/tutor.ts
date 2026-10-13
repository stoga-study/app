import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./auth/session";
import { supabase } from "./supabase";

export type Citation = { key: string; source_id: string; filename: string; kind: string; page: number };
export type SourceRef = { key: string; source_id: string; filename: string; kind: string; pages: number[] };
export type TutorMode = "chat" | "explain" | "hint" | "check";
export type TutorMessage = { id: string; role: "user" | "assistant"; content: string; hint_level: number | null; mode: TutorMode | null; citations: Citation[]; created_at: string };

export type TutorEvent =
  | { type: "meta"; thread_id: string; sources: SourceRef[]; uncovered: boolean }
  | { type: "mode"; mode: TutorMode }
  | { type: "delta"; text: string }
  | { type: "done"; message_id: string; content: string; citations: Citation[]; mode: TutorMode }
  | { type: "error"; error: string; resets_at?: string; used?: number; limit?: number; retry_after?: number };

export type ExplainContext = { kind: "card" | "quiz_question"; id: string };

/** Ask the tutor and stream its answer. Errors before the stream starts arrive as an "error" event too.
 * Either a typed question, or `context`: turns a card or a missed quiz question straight into an
 * "explain" answer grounded in its own pages, skipping the router. */
export async function askTutor(
  body:
    | { subject_id: string; question: string; hint_level: 1 | 2 | 3; thread_id?: string | null; followup?: boolean; depth_override?: "simpler" | "deeper"; worked_example?: boolean; retry_mode?: TutorMode }
    | { subject_id: string; context: ExplainContext; thread_id?: string | null },
  onEvent: (e: TutorEvent) => void,
  signal?: AbortSignal,
) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  let res: Response;
  try {
    res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tutor`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    onEvent({ type: "error", error: navigator.onLine ? "unavailable" : "offline" });
    return;
  }
  if (!res.headers.get("content-type")?.includes("event-stream")) {
    const j = await res.json().catch(() => ({}));
    onEvent({ type: "error", error: j.error ?? "unavailable", ...j });
    return;
  }
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true as const }));
    if (done) break;
    buf += value;
    let cut;
    while ((cut = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      const ev = /^event: (\w+)$/m.exec(block)?.[1];
      const raw = /^data: (.*)$/m.exec(block)?.[1];
      if (ev && raw) onEvent({ type: ev, ...JSON.parse(raw) } as TutorEvent);
    }
  }
}

export async function makeCardFromAnswer(messageId: string) {
  const { data, error } = await supabase.functions.invoke<{ card: { id: string; front: string; back: string } }>("tutor", { body: { mode: "card", message_id: messageId } });
  if (error || !data?.card) throw error ?? new Error("card_failed");
  return data.card;
}

export function useThreads(subjectId?: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["threads", session?.user.id, subjectId ?? "all"],
    enabled: !!session,
    queryFn: async () => {
      let q = supabase.from("chat_threads").select("id, subject_id, title, updated_at").order("updated_at", { ascending: false }).limit(30);
      if (subjectId) q = q.eq("subject_id", subjectId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useThreadMessages(threadId: string | null) {
  return useQuery({
    queryKey: ["thread", threadId],
    enabled: !!threadId,
    queryFn: async () => {
      const { data, error } = await supabase.from("chat_messages").select("id, role, content, hint_level, mode, citations, created_at").eq("thread_id", threadId!).order("created_at");
      if (error) throw error;
      return data as unknown as TutorMessage[];
    },
  });
}

export const HINT_LABEL: Record<number, string> = { 1: "Hint 1 of 3", 2: "Hint 2 of 3", 3: "Full explanation" };

/** Answers from before modes existed were all hints. */
export const modeOf = (m: { mode: TutorMode | null }): TutorMode => m.mode ?? "hint";

/** While streaming, the model may write citations as 【S1 p.7】; show them as [S1 p.7] and hide a half-written one. */
export const displayText = (content: string) =>
  content.replace(/【\s*(S\d+)\s*[†:,\s]*\s*(?:p\.?|pp\.?|page|part)?\s*(\d+)[^】]*】/gi, "[$1 p.$2]").replace(/【[^】]*】/g, "").replace(/【[^】]*$/, "");

/** Whether an answer cites the student's pages; answers without a citation came from general knowledge. */
export const citesNotes = (content: string) => /\[S\d+\s*(?:p\.?|pp\.?|page|part)?\s*\d+\]/i.test(displayText(content));
