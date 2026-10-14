import { useQueryClient } from "@tanstack/react-query";
import { Link2, RefreshCw, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { shortDate, timeText } from "@/lib/calendar";
import { calendarName } from "@/lib/ics";
import { addFeed, FeedError, fetchFeed, importItems, itemsFrom, removeFeed, syncFeed, type Feed, type ImportItem } from "@/lib/queries/calendarImport";
import type { Subject } from "@/lib/queries/profile";
import { KINDS } from "./EventForm";

const FEED_ERROR: Record<FeedError["code"], string> = {
  bad_url: "That doesn't look like a calendar link. It should start with https:// or webcal://.",
  not_found: "That calendar couldn't be opened. Check the link is the full private address, and that the calendar is shared or public.",
  unreachable: "We couldn't reach that calendar just now. Try again in a minute.",
  too_big: "That calendar is too big to bring in.",
  not_calendar: "That link isn't a calendar. Look for an “iCal”, “.ics” or “subscribe” link.",
  offline: "You're offline. Connect to bring in a calendar.",
};

/** Bring in a calendar: an .ics file once, or a link kept in sync. Every guess can be fixed first. */
export function CalendarImport({ subjects, onClose }: { subjects: Subject[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ items: ImportItem[]; name: string; url: string | null } | null>(null);
  const [keepSynced, setKeepSynced] = useState(true);
  const classes = subjects.map((s) => ({ id: s.id, name: s.name }));

  const show = (text: string, name: string, url: string | null) => {
    const items = itemsFrom(text, classes);
    if (!items.length) return toast("There's nothing coming up in that calendar to bring in (repeating items like class periods are left out).");
    setPreview({ items, name, url });
  };

  async function readFile(file: File) {
    if (file.size > 3_000_000) return toast("That file is too big to bring in.");
    const text = await file.text();
    if (!/BEGIN:VCALENDAR/i.test(text.slice(0, 2000))) return toast("That file isn't a calendar. Look for one ending in .ics.");
    show(text, calendarName(text) ?? file.name.replace(/\.ics$/i, ""), null);
  }

  async function readLink() {
    setBusy(true);
    try {
      const { text, url } = await fetchFeed(link);
      show(text, calendarName(text) ?? new URL(url).hostname, url);
    } catch (e) {
      toast(FEED_ERROR[e instanceof FeedError ? e.code : "unreachable"]);
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!preview) return;
    setBusy(true);
    try {
      const r = preview.url && keepSynced
        ? await addFeed({ name: preview.name, url: preview.url, subject_id: null, items: preview.items })
        : await importItems(preview.items, null);
      toast(`Added ${r.added} ${r.added === 1 ? "item" : "items"}${r.updated ? `, updated ${r.updated}` : ""}.`);
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["calendar-feeds"] });
      onClose();
    } catch (e) {
      const dup = (e as { code?: string }).code === "23505";
      toast(dup ? "That calendar is already linked. Refresh it from Linked calendars." : "We couldn't add those. Check your connection, then try again.");
    } finally {
      setBusy(false);
    }
  }

  const set = (uid: string, patch: Partial<ImportItem>) => setPreview((p) => p && { ...p, items: p.items.map((i) => (i.uid === uid ? { ...i, ...patch } : i)) });
  const count = preview?.items.filter((i) => i.include).length ?? 0;

  if (preview) {
    return (
      <section className="card flex flex-col gap-4 p-5" aria-labelledby="import-title">
        <div>
          <h2 id="import-title" className="text-[1.25rem]">{preview.name}</h2>
          <p className="text-[0.9375rem] text-muted">{preview.items.length} items from a month ago on. Check the kind and class we guessed, and untick anything you don't want.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[0.9375rem]">
          <label htmlFor="all-class" className="font-bold">Class for items with none:</label>
          <select id="all-class" className="input !min-h-10 min-w-0 flex-1" defaultValue="" onChange={(e) => setPreview((p) => p && { ...p, items: p.items.map((i) => (i.subject_id ? i : { ...i, subject_id: e.target.value || null })) })}>
            <option value="">Leave them without a class</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto rounded-xl border-2 border-line" aria-label="Items to bring in">
          {preview.items.map((i) => (
            <li key={i.uid} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={i.include} onChange={(e) => set(i.uid, { include: e.target.checked })} aria-label={`Bring in ${i.title}`} />
              <span className="min-w-[10rem] flex-1">
                <span className="block font-bold">{i.title}</span>
                <span className="block text-[0.8125rem] text-muted">{shortDate(i.date)}{i.time ? ` · ${timeText(`${i.time}:00`)}` : ""}</span>
              </span>
              <select className="input !min-h-10 w-32 !py-1 text-[0.875rem]" value={i.kind} onChange={(e) => set(i.uid, { kind: e.target.value as ImportItem["kind"] })} aria-label={`Kind for ${i.title}`}>
                {KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
              </select>
              <select className="input !min-h-10 w-40 !py-1 text-[0.875rem]" value={i.subject_id ?? ""} onChange={(e) => set(i.uid, { subject_id: e.target.value || null })} aria-label={`Class for ${i.title}`}>
                <option value="">No class</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </li>
          ))}
        </ul>
        {preview.url && (
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 size-5 accent-[var(--primary)]" checked={keepSynced} onChange={(e) => setKeepSynced(e.target.checked)} />
            <span><b>Keep it in sync.</b> <span className="text-muted">New and changed items come in when you open your calendar. Your changes to kinds, classes and ticks stay.</span></span>
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !count} onClick={() => void add()}>{busy ? "Adding…" : `Add ${count} ${count === 1 ? "item" : "items"}`}</Button>
          <Button variant="secondary" onClick={() => setPreview(null)}>Back</Button>
        </div>
      </section>
    );
  }

  return (
    <section className="card flex flex-col gap-5 p-5" aria-labelledby="import-title">
      <div>
        <h2 id="import-title" className="text-[1.25rem]">Bring in a calendar</h2>
        <p className="text-[0.9375rem] text-muted">From Schoology, Google Calendar, Outlook or Apple Calendar. Repeating items like class periods are left out.</p>
      </div>
      <div>
        <label htmlFor="ics-link" className="mb-1 block font-bold">Paste a calendar link</label>
        <p className="mb-2 text-[0.875rem] text-muted">In Schoology: Calendar, then the iCal export link. In Google Calendar: Settings, your calendar, then Secret address in iCal format.</p>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (link.trim()) void readLink(); }}>
          <input id="ics-link" className="input min-w-0 flex-1" inputMode="url" placeholder="https:// or webcal://" value={link} onChange={(e) => setLink(e.target.value)} />
          <Button type="submit" variant="secondary" disabled={busy || !link.trim()}><Link2 /> {busy ? "Getting it…" : "Get calendar"}</Button>
        </form>
      </div>
      <div>
        <p className="mb-1 font-bold">Or upload an .ics file</p>
        <label className="btn btn-secondary btn-sm cursor-pointer self-start">
          <Upload /> Choose a file
          <input type="file" accept=".ics,text/calendar" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ""; }} />
        </label>
      </div>
      <Button variant="ghost" className="self-start" onClick={onClose}>Cancel</Button>
    </section>
  );
}

/** Linked calendars, with Refresh and Remove (which removes what it added). */
export function LinkedCalendars({ feeds, subjects }: { feeds: Feed[]; subjects: Subject[] }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!feeds.length) return null;
  const done = () => {
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["calendar-feeds"] });
  };
  return (
    <section className="mt-6" aria-labelledby="linked">
      <h2 id="linked" className="mb-3 text-[1.25rem]">Linked calendars</h2>
      <ul className="card divide-y divide-line px-5">
        {feeds.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{f.name}</span>
              <span className="block text-[0.8125rem] text-muted">{f.last_synced_at ? `Updated ${new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(f.last_synced_at))}` : "Not updated yet"}</span>
            </span>
            {confirm === f.id ? (
              <>
                <span className="text-[0.9375rem]">Remove it and its items?</span>
                <Button size="sm" onClick={() => removeFeed(f.id).then(() => { toast(`${f.name} was removed.`); done(); }).catch(() => toast("We couldn't remove it. Try again."))}>Remove</Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirm(null)}>Keep</Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" disabled={busy === f.id} onClick={() => {
                  setBusy(f.id);
                  syncFeed(f, subjects.map((s) => ({ id: s.id, name: s.name })))
                    .then((r) => { toast(r.added || r.updated ? `${r.added} new, ${r.updated} changed.` : "Already up to date."); done(); })
                    .catch((e) => toast(FEED_ERROR[e instanceof FeedError ? e.code : "unreachable"]))
                    .finally(() => setBusy(null));
                }}><RefreshCw /> {busy === f.id ? "Updating…" : "Refresh"}</Button>
                <Button size="sm" variant="ghost" aria-label={`Remove ${f.name}`} onClick={() => setConfirm(f.id)}><Trash2 /></Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
