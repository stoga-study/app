import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useAuth } from "../auth/session";
import { addDays, today } from "../calendar";
import { guessClass, guessKind, parseIcs, type IcsEvent } from "../ics";
import { supabase } from "../supabase";
import type { EventKind } from "./events";

/** One item to bring in, after the student checked the guesses. */
export type ImportItem = IcsEvent & { kind: EventKind; subject_id: string | null; include: boolean };
export type Feed = { id: string; name: string; url: string; subject_id: string | null; last_synced_at: string | null };

export const MAX_IMPORT = 500;
/** Items from a month ago to a year ahead: enough for the school year, not a decade of history. */
export const inRange = (e: IcsEvent) => e.date >= addDays(today(), -30) && e.date <= addDays(today(), 365);

export class FeedError extends Error {
  constructor(public code: "bad_url" | "not_found" | "unreachable" | "too_big" | "not_calendar" | "offline") {
    super(code);
    this.name = "FeedError";
  }
}

/** The text of a calendar link, fetched by the server (browsers can't read other sites' calendars). */
export async function fetchFeed(url: string): Promise<{ text: string; url: string }> {
  if (!navigator.onLine) throw new FeedError("offline");
  const { data, error } = await supabase.functions.invoke<{ text: string; url: string }>("calendar-fetch", { body: { url } });
  if (error || !data) {
    const j = await (error as { context?: Response } | null)?.context?.json?.().catch(() => null);
    const code = j?.error;
    throw new FeedError(["bad_url", "not_found", "too_big", "not_calendar"].includes(code) ? code : "unreachable");
  }
  return data;
}

/** Items from a calendar's text, with a kind and class guessed for each, nearest first. */
export function itemsFrom(text: string, classes: { id: string; name: string }[], fallbackClass: string | null = null): ImportItem[] {
  return parseIcs(text)
    .filter(inRange)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, MAX_IMPORT)
    .map((e) => ({ ...e, kind: guessKind(e.title), subject_id: guessClass(e, classes) ?? fallbackClass, include: true }));
}

/**
 * Ask the AI about items the rules couldn't place: a kind for "other" ones, a class for ones with
 * none. Only those fields change. Returns the items unchanged if it fails, since the rules still stand.
 */
export async function refineWithAi(items: ImportItem[], classes: { id: string; name: string }[]): Promise<ImportItem[]> {
  const unsure = items.filter((i) => i.kind === "other" || !i.subject_id).slice(0, 150);
  if (!unsure.length || !navigator.onLine) return items;
  const { data, error } = await supabase.functions.invoke<{ results: { kind: ImportItem["kind"] | null; class: number | null }[] }>("calendar-fetch", {
    body: { classify: { items: unsure.map((i) => ({ title: i.title, notes: i.notes ?? "" })), classes: classes.map((c) => c.name) } },
  });
  if (error || !data?.results) return items;
  const better = new Map(unsure.map((i, k) => [i.uid, data.results[k]]));
  return items.map((i) => {
    const r = better.get(i.uid);
    if (!r) return i;
    return {
      ...i,
      kind: i.kind === "other" && r.kind ? r.kind : i.kind,
      subject_id: i.subject_id ?? (r.class != null ? classes[r.class]?.id ?? null : null),
    };
  });
}

const externalId = (feedId: string | null, uid: string) => (feedId ? `feed:${feedId}:${uid}` : `file:${uid}`).slice(0, 400);

/**
 * Add or update items. One already brought in (same calendar item) is updated, keeping the kind, class
 * and done state the student may have set. For a linked calendar, upcoming items it no longer has are
 * removed (ones ticked off stay). Returns how many were added and updated.
 */
export async function importItems(items: ImportItem[], feedId: string | null, refine?: (fresh: ImportItem[]) => Promise<ImportItem[]>) {
  const chosen = items.filter((i) => i.include);
  const ids = chosen.map((i) => externalId(feedId, i.uid));
  const existing = new Map<string, { id: string; title: string; due_on: string; due_time: string | null; notes: string | null }>();
  for (let k = 0; k < ids.length; k += 150) {
    const { data, error } = await supabase.from("events").select("id, external_id, title, due_on, due_time, notes").in("external_id", ids.slice(k, k + 150));
    if (error) throw error;
    for (const e of data) existing.set(e.external_id!, e);
  }
  let fresh = chosen.filter((i) => !existing.has(externalId(feedId, i.uid)));
  // Only new items are sorted again: ones already in keep whatever the student set.
  if (refine && fresh.length) fresh = await refine(fresh).catch(() => fresh);
  for (let k = 0; k < fresh.length; k += 100) {
    const { error } = await supabase.from("events").insert(fresh.slice(k, k + 100).map((i) => ({
      kind: i.kind, title: i.title, subject_id: i.subject_id, due_on: i.date, due_time: i.time, notes: i.notes, feed_id: feedId, external_id: externalId(feedId, i.uid),
    })));
    if (error) throw error;
  }
  let updated = 0;
  for (const i of chosen) {
    const e = existing.get(externalId(feedId, i.uid));
    if (!e || (e.title === i.title && e.due_on === i.date && (e.due_time?.slice(0, 5) ?? null) === i.time && e.notes === i.notes)) continue;
    const { error } = await supabase.from("events").update({ title: i.title, due_on: i.date, due_time: i.time, notes: i.notes }).eq("id", e.id);
    if (error) throw error;
    updated++;
  }
  if (feedId) {
    const { data: mine } = await supabase.from("events").select("id, external_id").eq("feed_id", feedId).gte("due_on", today()).is("done_at", null);
    const keep = new Set(ids);
    const gone = (mine ?? []).filter((e) => !keep.has(e.external_id ?? "")).map((e) => e.id);
    if (gone.length) await supabase.from("events").delete().in("id", gone);
  }
  return { added: fresh.length, updated };
}

export function useFeeds() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["calendar-feeds", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("calendar_feeds").select("id, name, url, subject_id, last_synced_at").order("created_at");
      if (error) throw error;
      return data as Feed[];
    },
  });
}

/** Link a calendar and bring in its items. */
export async function addFeed(o: { name: string; url: string; subject_id: string | null; items: ImportItem[] }) {
  const { data, error } = await supabase.from("calendar_feeds").insert({ name: o.name.slice(0, 80) || "My calendar", url: o.url, subject_id: o.subject_id, last_synced_at: new Date().toISOString() }).select("id").single();
  if (error) throw error;
  return importItems(o.items, data.id);
}

/** Bring a linked calendar up to date. */
export async function syncFeed(feed: Feed, classes: { id: string; name: string }[]) {
  const { text } = await fetchFeed(feed.url);
  const r = await importItems(itemsFrom(text, classes, feed.subject_id), feed.id, (fresh) => refineWithAi(fresh, classes));
  await supabase.from("calendar_feeds").update({ last_synced_at: new Date().toISOString() }).eq("id", feed.id);
  return r;
}

/** Removing a linked calendar removes the items it added. */
export async function removeFeed(id: string) {
  const { error } = await supabase.from("calendar_feeds").delete().eq("id", id);
  if (error) throw error;
}

/** Linked calendars more than 6 hours out of date sync quietly when the calendar opens. */
export function useAutoSync(classes: { id: string; name: string }[] | undefined) {
  const feeds = useFeeds();
  const qc = useQueryClient();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current || !feeds.data || !classes || !navigator.onLine) return;
    ran.current = true;
    const stale = feeds.data.filter((f) => !f.last_synced_at || Date.now() - Date.parse(f.last_synced_at) > 6 * 3600_000);
    if (!stale.length) return;
    void Promise.allSettled(stale.map((f) => syncFeed(f, classes))).then(() => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["calendar-feeds"] });
    });
  }, [feeds.data, classes, qc]);
  return feeds;
}
