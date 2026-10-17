import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";

export type SharePreview = {
  title: string; by: string | null; kind: string; pages: number; with_file: boolean;
  counts: { cards: number; notes: number; guide: number; terms: number; questions: number };
  expires_at: string; mine: boolean; added_id: string | null;
};

export class ShareError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "ShareError";
  }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("share", { body });
  if (error || !data) {
    const j = await (error as { context?: Response } | null)?.context?.json?.().catch(() => null);
    throw new ShareError(j?.error ?? (navigator.onLine ? "unavailable" : "offline"));
  }
  return data;
}

export const shareUrl = (token: string) => `${window.location.origin}/s/${token}`;
export const createShare = (sourceId: string, withFile: boolean) => call<{ token: string; expires_at: string }>({ action: "create", source_id: sourceId, with_file: withFile });
export const previewShare = (token: string) => call<SharePreview>({ action: "preview", token });
export const addShare = (token: string, subjectId: string) => call<{ source_id: string; already?: boolean }>({ action: "add", token, subject_id: subjectId });

/** The student's links for one file, newest first, with how many copies each has made. */
export function useShareLinks(sourceId: string | undefined) {
  return useQuery({
    queryKey: ["share-links", sourceId],
    enabled: !!sourceId,
    queryFn: async () => {
      const { data, error } = await supabase.from("share_links").select("id, token, with_file, expires_at, revoked_at, copies, created_at").eq("source_id", sourceId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data.filter((l) => !l.revoked_at && Date.parse(l.expires_at) > Date.now());
    },
  });
}

export function useRevokeShare() {
  const qc = useQueryClient();
  return async (id: string) => {
    const { error } = await supabase.from("share_links").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["share-links"] });
  };
}
