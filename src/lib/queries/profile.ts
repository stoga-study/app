import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
import { departmentTone, findCourse, findSection, type Picks } from "../catalog";
import type { Database } from "../database.types";
import { supabase } from "../supabase";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Subject = Database["public"]["Tables"]["subjects"]["Row"];

export function useProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("user_id", userId!).single();
      if (error) throw error;
      return data;
    },
  });
}

/** Every subject, archived ones included (they keep their notes and cards). */
export function useAllSubjects() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ["subjects", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useSubjects() {
  const all = useAllSubjects();
  return { ...all, data: all.data?.filter((s) => !s.archived) };
}

/** Current catalog picks, for prefilling the class picker. */
export const picksFrom = (subjects: Subject[] | undefined): Picks =>
  Object.fromEntries((subjects ?? []).filter((s) => s.catalog_id && !s.archived).map((s) => [s.catalog_id!, s.course_code ?? ""]));

/**
 * Bring the student's subjects in line with their picks. New classes are added, level changes
 * update the subject in place, and dropped classes are archived, never deleted, so their notes,
 * cards and quiz history survive a course change. Re-adding a dropped class restores it.
 */
async function saveClasses(picks: Picks, existing: Subject[]) {
  const byCatalog = new Map(existing.filter((s) => s.catalog_id).map((s) => [s.catalog_id!, s]));
  const inserts: Database["public"]["Tables"]["subjects"]["Insert"][] = [];
  const updates: { id: string; patch: Database["public"]["Tables"]["subjects"]["Update"] }[] = [];

  for (const [courseId, code] of Object.entries(picks)) {
    const course = findCourse(courseId);
    const section = course && findSection(course, code);
    if (!course || !section) throw new Error(`Choose a level for ${course?.title ?? "every class"}.`);
    const row = { name: section.name, area: course.department, course_code: section.code, level: section.level, archived: false };
    const current = byCatalog.get(courseId);
    if (!current) inserts.push({ ...row, catalog_id: courseId, color_index: departmentTone(course.department) });
    else if (current.archived || current.course_code !== row.course_code || current.name !== row.name)
      updates.push({ id: current.id, patch: row });
  }
  for (const s of existing)
    if (s.catalog_id && !s.archived && !(s.catalog_id in picks)) updates.push({ id: s.id, patch: { archived: true } });

  if (inserts.length) {
    const { error } = await supabase.from("subjects").insert(inserts);
    if (error) throw error;
  }
  for (const u of updates) {
    const { error } = await supabase.from("subjects").update(u.patch).eq("id", u.id);
    if (error) throw error;
  }
}

/** Saves the grade and classes; used by onboarding and the "Your classes" screen. */
export function useSaveClasses() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({ picks, graduationYear, firstName, finishOnboarding }: {
      picks: Picks; graduationYear: number; firstName?: string; finishOnboarding?: boolean;
    }) => {
      const userId = session!.user.id;
      const { data: existing, error } = await supabase.from("subjects").select("*");
      if (error) throw error;
      await saveClasses(picks, existing);
      const patch: Database["public"]["Tables"]["profiles"]["Update"] = { graduation_year: graduationYear };
      if (firstName !== undefined) patch.first_name = firstName.trim().slice(0, 60) || null;
      if (finishOnboarding) patch.onboarded = true;
      const { error: pErr } = await supabase.from("profiles").update(patch).eq("user_id", userId);
      if (pErr) throw pErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["subjects"] });
    },
  });
}

/** Archive a subject that is not from the catalog (added before grade-aware classes). */
export function useArchiveSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subjects").update({ archived: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subjects"] }),
  });
}
