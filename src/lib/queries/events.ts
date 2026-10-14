import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
import { addDays, today } from "../calendar";
import type { Database } from "../database.types";
import { supabase } from "../supabase";

export type EventKind = "test" | "quiz" | "homework" | "project" | "other";
export type CalEvent = Omit<Database["public"]["Tables"]["events"]["Row"], "kind"> & { kind: EventKind; unit_ids: string[] };
export type EventDraft = {
  kind: EventKind; title: string; subject_id: string | null; due_on: string; due_time: string | null; notes: string | null; unit_ids: string[];
};

/** Things that can be ticked off as done. */
export const isTask = (k: EventKind) => k === "homework" || k === "project";
/** Things to study for. */
export const isExam = (k: EventKind) => k === "test" || k === "quiz";

/** Everything from 60 days ago on, earliest first, with the units each one covers. */
export function useEvents() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["events", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*, event_units(unit_id)")
        .gte("due_on", addDays(today(), -60))
        .order("due_on")
        .order("due_time", { nullsFirst: true });
      if (error) throw error;
      return data.map(({ event_units, ...e }) => ({ ...e, kind: e.kind as EventKind, unit_ids: event_units.map((u) => u.unit_id) })) as CalEvent[];
    },
  });
}

async function setUnits(eventId: string, unitIds: string[]) {
  const { error } = await supabase.from("event_units").delete().eq("event_id", eventId);
  if (error) throw error;
  if (!unitIds.length) return;
  const { error: insErr } = await supabase.from("event_units").insert(unitIds.map((unit_id) => ({ event_id: eventId, unit_id })));
  if (insErr) throw insErr;
}

/** Add an event, or change one when `id` is given. */
export function useSaveEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, draft }: { id?: string; draft: EventDraft }) => {
      const { unit_ids, ...row } = draft;
      const units = isExam(draft.kind) && draft.subject_id ? unit_ids : [];
      if (id) {
        const { error } = await supabase.from("events").update(row).eq("id", id);
        if (error) throw error;
        await setUnits(id, units);
        return id;
      }
      const { data, error } = await supabase.from("events").insert(row).select("id").single();
      if (error) throw error;
      await setUnits(data.id, units);
      return data.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
}

/** Tick a homework or project off, or untick it. Shown at once; put back if saving fails. */
export function useToggleDone() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const key = ["events", session?.user.id];
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase.from("events").update({ done_at: done ? new Date().toISOString() : null }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<CalEvent[]>(key);
      qc.setQueryData<CalEvent[]>(key, (xs) => xs?.map((e) => (e.id === id ? { ...e, done_at: done ? new Date().toISOString() : null } : e)));
      return { before };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(key, ctx?.before),
    onSettled: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
}
