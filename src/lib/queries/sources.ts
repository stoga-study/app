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
  image: "image/jpeg",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;

const safeName = (name: string) => name.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(-120) || "file";

/**
 * Save an extracted file: take one upload from the allowance and create the source, store the original
 * privately, then save the page text. If any step fails the upload is undone and given back.
 */
/** SHA-256 of a file, as hex. Identical files (the same handout) get the same fingerprint. */
async function fingerprint(file: File) {
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null; // Sharing is an optimisation; the upload works without it.
  }
}

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
      // A photo is stored as the upright, shrunk JPEG it was read from.
      const name = extracted.upload ? safeName(file.name).replace(/\.[a-z0-9]+$/i, "") + ".jpg" : safeName(file.name);
      storagePath = `${userId}/${id}/${name}`;
      const { error: upErr } = await supabase.storage
        .from("sources")
        .upload(storagePath, extracted.upload ?? file, { contentType: STORAGE_TYPES[extracted.kind], upsert: false });
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
      .update({
        status: "ready_text",
        page_count: extracted.totalPages,
        storage_path: storagePath,
        original_filename: (opts.originalName ?? filename).slice(0, 255),
        content_hash: file ? await fingerprint(file) : null,
      })
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

/** Archive or restore a file, or change its tags. Archiving moves its cards and quizzes out of
 * review, so every cached list is refreshed. */
export function useUpdateSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { archived?: boolean; tags?: string[] } }) => {
      const { error } = await supabase.from("sources").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => (v.patch.archived === undefined ? qc.invalidateQueries({ queryKey: ["sources"] }).then(() => qc.invalidateQueries({ queryKey: ["source", v.id] })) : qc.invalidateQueries()),
  });
}

/** Tidy a typed tag: lowercase words joined by dashes, no leading #, at most 30 characters. */
export const cleanTag = (t: string) => t.toLowerCase().replace(/^#+/, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 30);

/** Copy a file and its study set (fresh cards, no reported items) into a class; returns the copy's id. */
export async function duplicateSource(source: Source, subjectId: string, userId: string): Promise<string> {
  const { data: id, error } = await supabase.rpc("duplicate_source", { p_source: source.id, p_subject: subjectId });
  if (error) throw error;
  if (source.storage_path) {
    // The original file is copied too, so deleting either one later leaves the other whole.
    const path = `${userId}/${id}/${source.storage_path.split("/").pop()}`;
    const { error: cpErr } = await supabase.storage.from("sources").copy(source.storage_path, path);
    if (!cpErr) await supabase.from("sources").update({ storage_path: path }).eq("id", id);
  }
  return id;
}

export async function openOriginal(source: Source) {
  if (!source.storage_path) return;
  const { data, error } = await supabase.storage.from("sources").createSignedUrl(source.storage_path, 120);
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener");
}

/** A longer-lived signed URL for the in-app viewer, so a student can stay on one page a while. */
export function useSignedFileUrl(storagePath: string | null | undefined) {
  return useQuery({
    queryKey: ["signed-file", storagePath],
    enabled: !!storagePath,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("sources").createSignedUrl(storagePath!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

/** PDFs and photos have pages (and open in the viewer); slide decks have slides; Word files and pasted text are split into parts. */
export const isPaged = (kind: string) => kind === "pdf" || kind === "image";
export const pageWord = (kind: string, n: number) =>
  isPaged(kind) ? (n === 1 ? "page" : "pages") : kind === "pptx" ? (n === 1 ? "slide" : "slides") : n === 1 ? "part" : "parts";
