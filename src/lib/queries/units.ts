import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Database } from "../database.types";
import { supabase } from "../supabase";
import { byNumber, type UnitLabel } from "../units";

export type Unit = Database["public"]["Tables"]["units"]["Row"];

/** Where a file goes: a unit the class has, a new one, or no unit. `lesson` is like "11.1". */
export type UnitChoice =
  | { kind: "existing"; id: string; lesson: string | null }
  | { kind: "new"; number: string | null; title: string | null; word: string; lesson: string | null }
  | { kind: "none" };

export function useUnits(subjectId: string | undefined) {
  return useQuery({
    queryKey: ["units", subjectId],
    enabled: !!subjectId,
    // Small, and changed by uploads moments earlier: always check when a page opens.
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.from("units").select("*").eq("subject_id", subjectId!);
      if (error) throw error;
      return data.sort(byNumber);
    },
  });
}

/** Every unit the student has, for pages that show many classes. */
export function useAllUnits() {
  return useQuery({
    queryKey: ["units"],
    queryFn: async () => {
      const { data, error } = await supabase.from("units").select("*");
      if (error) throw error;
      return data.sort(byNumber);
    },
  });
}

/** The choice a detected label suggests: the class's unit with that number, or a new one. */
export function choiceFor(label: UnitLabel | null, units: Unit[]): UnitChoice | null {
  if (!label) return null;
  const have = units.find((u) => u.number === label.number);
  return have ? { kind: "existing", id: have.id, lesson: label.lesson } : { kind: "new", number: label.number, title: label.title, word: label.word, lesson: label.lesson };
}

/** The unit id for a choice, creating the unit if the class does not have it yet. */
async function unitId(subjectId: string, c: UnitChoice): Promise<string | null> {
  if (c.kind === "none") return null;
  if (c.kind === "existing") return c.id;
  if (c.number) {
    // The class may already have this number (made on another device, or the list was still loading).
    const { data: have } = await supabase.from("units").select("id, title").eq("subject_id", subjectId).eq("number", c.number).maybeSingle();
    if (have) {
      if (!have.title && c.title) await supabase.from("units").update({ title: c.title }).eq("id", have.id);
      return have.id;
    }
  }
  const { data, error } = await supabase
    .from("units")
    .insert({ subject_id: subjectId, number: c.number, title: c.title?.slice(0, 80) || null, word: c.word })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * Files a file under a unit (or none). After an upload (`follow`), the class's current unit becomes
 * that unit unless the student pinned one.
 */
export async function fileUnder(sourceId: string, subjectId: string, c: UnitChoice, follow = false) {
  const id = await unitId(subjectId, c);
  const lesson = c.kind === "none" ? null : c.lesson && /^\d{1,3}\.\d{1,3}$/.test(c.lesson) ? c.lesson : null;
  const { error } = await supabase.from("sources").update({ unit_id: id, lesson }).eq("id", sourceId);
  if (error) throw error;
  if (follow && id) await supabase.from("subjects").update({ current_unit_id: id }).eq("id", subjectId).eq("current_unit_pinned", false);
  return id;
}

function useRefresh() {
  const qc = useQueryClient();
  return (sourceId?: string) => {
    qc.invalidateQueries({ queryKey: ["units"] });
    qc.invalidateQueries({ queryKey: ["sources"] });
    qc.invalidateQueries({ queryKey: ["subjects"] });
    if (sourceId) qc.invalidateQueries({ queryKey: ["source", sourceId] });
  };
}

/** Change which unit a file is in, from the file's page. */
export function useFileUnder() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (v: { sourceId: string; subjectId: string; choice: UnitChoice }) => fileUnder(v.sourceId, v.subjectId, v.choice),
    onSuccess: (_d, v) => refresh(v.sourceId),
  });
}

/** Set (and pin) the unit a class is on, or unpin so it follows uploads again. */
export function useCurrentUnit() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { subjectId: string; unitId: string | null; pinned: boolean }) => {
      const { error } = await supabase.from("subjects").update({ current_unit_id: v.unitId, current_unit_pinned: v.pinned }).eq("id", v.subjectId);
      if (error) throw error;
    },
    onSuccess: () => refresh(),
  });
}

export function useRenameUnit() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { id: string; title: string }) => {
      const { error } = await supabase.from("units").update({ title: v.title.trim().slice(0, 80) || null }).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => refresh(),
  });
}
