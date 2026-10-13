import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "../auth/session";
import { del, get, set } from "../offline/kv";
import { supabase } from "../supabase";

// Your own notes are saved on the device on every change, then sent to the server a moment later.
// A draft stays on the device until the server has that exact version, so nothing typed offline is lost.

export type NoteDraft = {
  id: string;
  subject_id: string;
  unit_id: string | null;
  source_id: string | null;
  title: string;
  body: string;
  updated_at: string;
};
export type NoteSummary = Pick<NoteDraft, "id" | "unit_id" | "source_id" | "title" | "body" | "updated_at">;

const draftKey = (id: string) => `note-draft:${id}`;
const PENDING = "note-drafts";

async function pendingIds(): Promise<string[]> {
  try {
    return JSON.parse((await get(PENDING)) ?? "[]");
  } catch {
    return [];
  }
}

async function readDraft(id: string): Promise<NoteDraft | null> {
  const raw = await get(draftKey(id));
  return raw ? (JSON.parse(raw) as NoteDraft) : null;
}

/** Keep this version on the device until the server has it. */
export async function saveDraft(d: NoteDraft) {
  await set(draftKey(d.id), JSON.stringify(d));
  const ids = await pendingIds();
  if (!ids.includes(d.id)) await set(PENDING, JSON.stringify([...ids, d.id]));
}

async function dropDraft(id: string) {
  await del(draftKey(id));
  await set(PENDING, JSON.stringify((await pendingIds()).filter((x) => x !== id)));
}

/** Send one version. The device copy is dropped only if nothing newer was typed meanwhile. */
export async function pushNote(d: NoteDraft) {
  const { error } = await supabase.from("student_notes").upsert(d, { onConflict: "id" });
  if (error) throw error;
  const now = await readDraft(d.id);
  if (now && now.updated_at === d.updated_at) await dropDraft(d.id);
}

let flushing: Promise<void> | null = null;
/** Send every note still waiting on this device. Stops quietly when offline. */
export function flushNotes(qc?: QueryClient): Promise<void> {
  return (flushing ??= (async () => {
    try {
      let sent = 0;
      for (const id of await pendingIds()) {
        if (!navigator.onLine) break;
        const d = await readDraft(id);
        if (!d) {
          await dropDraft(id);
          continue;
        }
        // An empty note that was never sent is not worth keeping.
        if (!d.title.trim() && !d.body.trim()) {
          await dropDraft(id);
          continue;
        }
        await pushNote(d).then(() => sent++, () => undefined);
      }
      if (sent) qc?.invalidateQueries({ queryKey: ["notes"] });
    } finally {
      flushing = null;
    }
  })());
}

/** A class's notes, newest first (for the class page and each file's page). */
export function useNotes(subjectId: string | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["notes", subjectId],
    enabled: !!session && !!subjectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_notes")
        .select("id, unit_id, source_id, title, body, updated_at")
        .eq("subject_id", subjectId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as NoteSummary[];
    },
  });
}

/**
 * One note: the device's draft when it is newer than the server's copy (or the server is out of
 * reach), otherwise the server's. Null for a note that does not exist yet (a new one).
 */
export function useNote(id: string | undefined) {
  return useQuery({
    queryKey: ["note", id],
    enabled: !!id,
    // Always check for a newer copy (another device); the editor waits for that check before it starts.
    staleTime: 0,
    queryFn: async (): Promise<NoteDraft | null> => {
      const draft = await readDraft(id!);
      const { data, error } = await supabase
        .from("student_notes")
        .select("id, subject_id, unit_id, source_id, title, body, updated_at")
        .eq("id", id!)
        .maybeSingle();
      if (error) {
        if (draft) return draft;
        throw error;
      }
      if (draft && (!data || draft.updated_at > data.updated_at)) return draft;
      return data;
    },
  });
}

/** Sends waiting notes when the app opens and whenever the connection comes back. */
export function useNoteSync() {
  const qc = useQueryClient();
  useEffect(() => {
    const go = () => void flushNotes(qc);
    const t = setTimeout(go, 1500);
    window.addEventListener("online", go);
    return () => {
      clearTimeout(t);
      window.removeEventListener("online", go);
    };
  }, [qc]);
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return async (id: string) => {
    await dropDraft(id);
    const { error } = await supabase.from("student_notes").delete().eq("id", id);
    if (error) throw error;
    qc.removeQueries({ queryKey: ["note", id] });
    await qc.invalidateQueries({ queryKey: ["notes"] });
  };
}
