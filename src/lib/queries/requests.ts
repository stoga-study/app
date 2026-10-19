import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
import { supabase } from "../supabase";

export type RequestStatus = "review" | "open" | "planned" | "building" | "shipped" | "declined";
export type FeatureRequest = { id: string; title: string; body: string; status: RequestStatus; note: string | null; votes: number; voted: boolean; mine: boolean; created_at: string };
export const STATUS_LABEL: Record<RequestStatus, string> = { review: "Waiting for review", open: "Open", planned: "Planned", building: "Being built", shipped: "Shipped", declined: "Not planned" };

/** Sort for the board's views. */
export function boardView(items: FeatureRequest[], view: "top" | "new" | "done") {
  const live = items.filter((r) => r.status === "open" || r.status === "planned" || r.status === "building");
  if (view === "top") return [...live].sort((a, b) => b.votes - a.votes || b.created_at.localeCompare(a.created_at));
  if (view === "new") return [...live].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return items.filter((r) => r.status === "shipped" || r.status === "planned" || r.status === "building").sort((a, b) => (a.status === "shipped" ? 1 : 0) - (b.status === "shipped" ? 1 : 0) || b.votes - a.votes);
}

export function useBoard() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["feature-board", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("feature_board");
      if (error) throw error;
      return data as FeatureRequest[];
    },
  });
}

export function useSuggest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ title, body }: { title: string; body: string }) => {
      const { error } = await supabase.from("feature_requests").insert({ title: title.trim().slice(0, 80), body: body.trim().slice(0, 600) });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feature-board"] }),
  });
}

/** Vote, or take a vote back, updating the board at once. */
export function useVote() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const key = ["feature-board", session?.user.id];
  return useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) => {
      const { error } = on
        ? await supabase.from("feature_votes").insert({ request_id: id })
        : await supabase.from("feature_votes").delete().eq("request_id", id).eq("user_id", session!.user.id);
      if (error) throw error;
    },
    onMutate: async ({ id, on }) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<FeatureRequest[]>(key);
      qc.setQueryData<FeatureRequest[]>(key, (rows) => rows?.map((r) => (r.id === id ? { ...r, voted: on, votes: r.votes + (on ? 1 : -1) } : r)));
      return { before };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(key, ctx?.before),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
