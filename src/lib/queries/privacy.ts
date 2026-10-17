import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
import { supabase } from "../supabase";
import { saveCoach, saveCoachRemote } from "./coach";

/** Whether this student's study sets are offered to others who upload the same file. */
export function useShareStudySets() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["share-study-sets", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("share_study_sets").maybeSingle();
      if (error) throw error;
      return data?.share_study_sets ?? true;
    },
  });
  const set = useMutation({
    mutationFn: async (on: boolean) => {
      const { data, error } = await supabase.rpc("set_share_study_sets", { p_on: on });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, on) => qc.setQueryData(["share-study-sets", session?.user.id], on),
  });
  return { on: q.data ?? true, loading: q.isPending, set };
}

export function useTutorChatCount() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["threads", session?.user.id, "count"],
    enabled: !!session,
    queryFn: async () => {
      const { count, error } = await supabase.from("chat_threads").select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useDeleteThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chat_threads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: ["thread", id] });
      return qc.invalidateQueries({ queryKey: ["threads"] });
    },
  });
}

export function useDeleteAllThreads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("delete_tutor_chats");
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["thread"] });
      return qc.invalidateQueries({ queryKey: ["threads"] });
    },
  });
}

/** Clear the coach conversation here and on every other device. */
export async function clearCoachChat(userId: string) {
  const at = Date.now();
  saveCoach(userId, [], at);
  await saveCoachRemote(userId, [], at);
}
