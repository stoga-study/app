import { supabase } from "../supabase";

/** Why an AI helper for notes could not run: today's limit, the student's own key, or a busy service. */
export class AssistError extends Error {
  constructor(public code: "limit" | "key_invalid" | "busy" | "unavailable" | "offline" | "no_file" | "empty_note") {
    super(code);
    this.name = "AssistError";
  }
}

async function call<T>(body: { note_id: string; action: "tidy" | "fill_gaps" | "make_cards" }): Promise<T> {
  if (!navigator.onLine) throw new AssistError("offline");
  const { data, error } = await supabase.functions.invoke<T>("notes-assist", { body });
  if (error || !data) {
    const j = await (error as { context?: Response } | null)?.context?.json?.().catch(() => null);
    const code = j?.error;
    throw new AssistError(["limit", "key_invalid", "busy", "no_file", "empty_note"].includes(code) ? code : "unavailable");
  }
  return data;
}

/** Tidy: a cleaned-up version of the note's body. The student applies it themselves. */
export const tidyNote = (noteId: string) => call<{ body: string }>({ note_id: noteId, action: "tidy" });

/** Fill gaps: facts the linked file covers that the note does not, each with the page it came from. */
export const fillGaps = (noteId: string) => call<{ additions: { text: string; page: number }[]; word: "page" | "part" }>({ note_id: noteId, action: "fill_gaps" });

/** Make cards: real flashcards, already saved, from what the note says. */
export const makeCardsFromNote = (noteId: string) => call<{ cards: { id: string; front: string; back: string }[] }>({ note_id: noteId, action: "make_cards" });
