import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
import type { Readiness } from "../readiness";
import { supabase } from "../supabase";

export const RELATIONS = [["parent", "Parent"], ["guardian", "Guardian"], ["tutor", "Tutor"], ["counselor", "Counselor"], ["other", "Someone else"]] as const;
export type Relation = (typeof RELATIONS)[number][0];
export type SupportLink = { id: string; token: string; label: string; relation: Relation; created_at: string; expires_at: string; revoked_at: string | null; last_viewed_at: string | null; views: number };

export const supportUrl = (token: string) => `${window.location.origin}/support/${token}`;
export const isLive = (l: SupportLink) => !l.revoked_at && Date.parse(l.expires_at) > Date.now();

/** The student's support links, newest first (their own, through row-level security). */
export function useSupportLinks() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["support-links", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("support_links").select("id, token, label, relation, created_at, expires_at, revoked_at, last_viewed_at, views").order("created_at", { ascending: false });
      if (error) throw error;
      return data as SupportLink[];
    },
  });
}

export function useCreateSupportLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ label, relation }: { label: string; relation: Relation }) => {
      const { data, error } = await supabase.rpc("create_support_link", { p_label: label, p_relation: relation });
      if (error) throw error;
      return data as unknown as SupportLink;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-links"] }),
  });
}

export function useRevokeSupportLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("revoke_support_link", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-links"] }),
  });
}

/** What a support link shows (see supabase/functions/_lib/support.ts). */
export type SupportSummary = {
  name: string;
  today: string;
  days: { date: string; n: number }[];
  daysStudied7: number;
  items7: number;
  classes: { name: string; items7: number; accuracy30: number | null }[];
  upcoming: { title: string; kind: string; className: string | null; due_on: string; done: boolean; readiness: Readiness | null }[];
};

/** The summary behind a link, for someone without an account. Null when the link is unknown, expired or turned off. */
export function useSupportView(token: string | undefined) {
  return useQuery({
    queryKey: ["support-view", token],
    enabled: !!token,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ summary: SupportSummary; label: string; expires_at: string }>("support-view", { body: { token } });
      if (error || !data?.summary) {
        const status = (error as { context?: Response } | null)?.context?.status;
        if (status === 404) return null;
        throw error ?? new Error("support_view_failed");
      }
      return data;
    },
  });
}
