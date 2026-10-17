import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
import { supabase } from "../supabase";
import { ShareError } from "./share";

export type GroupSet = {
  id: string; title: string; kind: string; pages: number; by: string; mine_shared: boolean; created_at: string; added_id: string | null; hidden: boolean;
  counts: { cards: number; notes: number; guide: number; terms: number; questions: number };
};

const fail = (e: { message?: string } | null) => {
  const m = e?.message ?? "";
  for (const code of ["group_limit", "group_full", "no_group", "not_owner"]) if (m.includes(code)) throw new ShareError(code);
  throw new ShareError("unavailable");
};

/** The student's groups, with how many are in each. */
export function useGroups() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["groups", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("groups").select("id, name, code, owner_id, created_at, group_members(count)").order("created_at", { ascending: false });
      if (error) throw error;
      return data.map((g) => ({ ...g, members: (g.group_members as unknown as { count: number }[])[0]?.count ?? 0 }));
    },
  });
}

/** One group and its members (first names only). */
export function useGroup(id: string | undefined) {
  return useQuery({
    queryKey: ["group", id],
    enabled: !!id,
    queryFn: async () => {
      const [g, m] = await Promise.all([
        supabase.from("groups").select("id, name, code, owner_id, created_at").eq("id", id!).maybeSingle(),
        supabase.from("group_members").select("user_id, display_name, joined_at").eq("group_id", id!).order("joined_at"),
      ]);
      if (g.error) throw g.error;
      if (m.error) throw m.error;
      return g.data ? { ...g.data, members: m.data } : null;
    },
  });
}

/** A group's shared library (titles and what's in each come through the share function). */
export function useGroupSets(id: string | undefined) {
  return useQuery({
    queryKey: ["group-sets", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ sets: GroupSet[] }>("share", { body: { action: "group_sets", group_id: id } });
      if (error || !data) throw new ShareError("unavailable");
      return data.sets;
    },
  });
}

export async function createGroup(name: string) {
  const { data, error } = await supabase.rpc("create_group", { p_name: name });
  if (error) fail(error);
  return data as string;
}
export async function joinGroup(code: string) {
  const { data, error } = await supabase.rpc("join_group", { p_code: code });
  if (error) fail(error);
  return data as string;
}
export async function peekGroup(code: string) {
  const { data, error } = await supabase.rpc("peek_group", { p_code: code });
  if (error) fail(error);
  return (data as { name: string; members: number; joined: boolean }[])[0] ?? null;
}
export async function resetCode(groupId: string) {
  const { data, error } = await supabase.rpc("reset_group_code", { p_group: groupId });
  if (error) fail(error);
  return data as string;
}
/** Leave (yourself) or, as the owner, remove someone. */
export async function removeMember(groupId: string, userId: string) {
  const { error } = await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", userId);
  if (error) fail(error);
}
export async function shareToGroup(groupId: string, sourceId: string) {
  const { error } = await supabase.from("group_sets").insert({ group_id: groupId, source_id: sourceId });
  if (error && error.code !== "23505") fail(error);
}
export async function unshareFromGroup(setId: string) {
  const { error } = await supabase.from("group_sets").delete().eq("id", setId);
  if (error) fail(error);
}
export async function addGroupSet(setId: string, subjectId: string) {
  const { data, error } = await supabase.functions.invoke<{ source_id: string; already?: boolean }>("share", { body: { action: "group_add", set_id: setId, subject_id: subjectId } });
  if (error || !data) throw new ShareError("unavailable");
  return data;
}

export const joinUrl = (code: string) => `${window.location.origin}/join/${code}`;

export function useRefreshGroups() {
  const qc = useQueryClient();
  return () => Promise.all(["groups", "group", "group-sets"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

export type SetChange = { id: string; display_name: string; item_type: "card" | "note_section"; item_id: string; before: Record<string, string>; after: Record<string, string>; created_at: string; undone_at: string | null; undone_by: string | null };
export type SetItems = {
  title: string; locked: boolean; can_edit: boolean; can_lock: boolean; mine: boolean;
  cards: { id: string; front: string; back: string }[];
  notes: { id: string; title: string; body_md: string }[];
  history: SetChange[];
};

async function shareCall<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("share", { body });
  if (error || !data) {
    const j = await (error as { context?: Response } | null)?.context?.json?.().catch(() => null);
    throw new ShareError(j?.error ?? "unavailable");
  }
  return data;
}

/** The group's version of a shared set: its cards and note sections, and who changed what. */
export function useSetItems(setId: string | undefined) {
  return useQuery({ queryKey: ["set-items", setId], enabled: !!setId, queryFn: () => shareCall<SetItems>({ action: "set_items", set_id: setId }) });
}
export const editSetItem = (setId: string, itemType: "card" | "note_section", itemId: string, fields: Record<string, string>) =>
  shareCall<{ change_id?: string; unchanged?: boolean }>({ action: "set_edit", set_id: setId, item_type: itemType, item_id: itemId, fields });
export const undoSetChange = (changeId: string) => shareCall<{ undone: boolean }>({ action: "set_undo", change_id: changeId });
export async function setLocked(setId: string, locked: boolean) {
  const { error } = await supabase.from("group_sets").update({ locked }).eq("id", setId);
  if (error) throw new ShareError("unavailable");
}

/** A group owner brings back a set that reports hid. */
export async function restoreGroupSet(setId: string) {
  const { error } = await supabase.rpc("restore_group_set", { p_set: setId });
  if (error) throw new ShareError("unavailable");
}
