import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
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

export function useSubjects() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ["subjects", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("*")
        .eq("archived", false)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

/** Finishes onboarding: saves the first name, creates the chosen subjects, marks the profile done. */
export function useCompleteOnboarding() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({ firstName, subjects }: { firstName: string; subjects: { name: string; area: string }[] }) => {
      const userId = session!.user.id;
      if (subjects.length) {
        const { error } = await supabase
          .from("subjects")
          .insert(subjects.map((s, i) => ({ name: s.name, area: s.area, color_index: i % 4 })));
        if (error) throw error;
      }
      const { error } = await supabase
        .from("profiles")
        .update({ first_name: firstName || null, onboarded: true })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["subjects"] });
    },
  });
}
