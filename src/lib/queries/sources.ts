import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
import type { Database } from "../database.types";
import type { Extracted } from "../extract";
import { supabase } from "../supabase";

export type Source = Database["public"]["Tables"]["sources"]["Row"];
export type UsageKind = Database["public"]["Enums"]["usage_kind"];
export type Allowance = { used: number; limit: number | null; resetsAt: string };

export function useAllowance() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["allowance", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("allowance_status");
      if (error) throw error;
      const out: Partial<Record<UsageKind, Allowance>> = {};
      for (const r of data) out[r.kind] = { used: r.used, limit: r.limit, resetsAt: r.resets_at };
      return out;
    },
  });
}

export function useSources() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["sources", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("sources").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useSource(id: string | undefined) {
  return useQuery({
    queryKey: ["source", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("sources").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSourcePages(id: string | undefined) {
  return useQuery({
    queryKey: ["source-pages", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("source_pages").select("page_no, text").eq("source_id", id!).order("page_no");
      if (error) throw error;
      return data;
    },
  });
}

/** Thrown when this month's uploads are used up. */
export class UploadLimitError extends Error {
  constructor() {
    super("upload_limit");
    this.name = "UploadLimitError";
  }
}

const STORAGE_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  text: "text/plain",
} as const;

const safeName = (name: string) => name.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(-120) || "file";

/**
 * Save an extracted file: take one upload from the allowance and create the source, store the original
 * privately, then save the page text. If any step fails the upload is undone and given back.
 */
export async function saveUpload(opts: {
  userId: string;
  subjectId: string;
  filename: string;
  /** The file's real name, kept for reference; `filename` is the readable title shown in the app. */
  originalName?: string;
  extracted: Extracted;
  file?: File;
  onSaving?: (done: number, total: number) => void;
}): Promise<string> {
  const { userId, subjectId, filename, extracted, file } = opts;
  const { data: id, error } = await supabase.rpc("begin_upload", {
    p_subject: subjectId,
    p_filename: filename.slice(0, 255),
    p_kind: extracted.kind,
    p_bytes: file?.size ?? new Blob(extracted.pages.map((p) => p.text)).size,
  });
  if (error) throw error.message.includes("upload_limit") ? new UploadLimitError() : error;

  let storagePath: string | null = null;
  try {
    if (file) {
      storagePath = `${userId}/${id}/${safeName(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from("sources")
        .upload(storagePath, file, { contentType: STORAGE_TYPES[extracted.kind], upsert: false });
      if (upErr) throw upErr;
    }
    const rows = extracted.pages.map((p) => ({ source_id: id, page_no: p.page, text: p.text }));
    for (let i = 0; i < rows.length; i += 40) {
      const { error: pErr } = await supabase.from("source_pages").insert(rows.slice(i, i + 40));
      if (pErr) throw pErr;
      opts.onSaving?.(Math.min(i + 40, rows.length), rows.length);
    }
    const { error: sErr } = await supabase
      .from("sources")
      .update({ status: "ready_text", page_count: extracted.totalPages, storage_path: storagePath, original_filename: (opts.originalName ?? filename).slice(0, 255) })
      .eq("id", id);
    if (sErr) throw sErr;
    return id;
  } catch (e) {
    if (storagePath) await supabase.storage.from("sources").remove([storagePath]);
    await supabase.rpc("cancel_upload", { p_source: id });
    throw e;
  }
}

/** Ask the server for a smarter title (the AI reads the first page). Never throws: the cleaned title stays. */
export async function suggestTitle(sourceId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke<{ title: string; changed: boolean }>("title-source", { body: { source_id: sourceId } });
    return !error && data?.changed ? data.title : null;
  } catch {
    return null;
  }
}

export function useRenameSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase.from("sources").update({ filename: title }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["source", v.id] });
      qc.invalidateQueries({ queryKey: ["sources"] });
    },
  });
}

export function useDeleteSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (source: Source) => {
      if (source.storage_path) await supabase.storage.from("sources").remove([source.storage_path]);
      const { error } = await supabase.from("sources").delete().eq("id", source.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });
}

export async function openOriginal(source: Source) {
  if (!source.storage_path) return;
  const { data, error } = await supabase.storage.from("sources").createSignedUrl(source.storage_path, 120);
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener");
}

export const pageWord = (kind: string, n: number) => (kind === "pdf" ? (n === 1 ? "page" : "pages") : n === 1 ? "part" : "parts");
