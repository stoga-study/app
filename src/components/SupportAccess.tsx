import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { dateFormat } from "@/lib/locale";
import { isLive, RELATIONS, supportUrl, useCreateSupportLink, useRevokeSupportLink, useSupportLinks, type Relation, type SupportLink } from "@/lib/queries/support";

const day = (iso: string) => dateFormat({ month: "short", day: "numeric" }).format(new Date(iso));

/** Settings > Support access: a private, read-only link for a parent, guardian, tutor or counselor. */
export function SupportAccess() {
  const links = useSupportLinks();
  const create = useCreateSupportLink();
  const [label, setLabel] = useState("");
  const [relation, setRelation] = useState<Relation>("parent");
  const live = (links.data ?? []).filter(isLive);
  const past = (links.data ?? []).filter((l) => !isLive(l)).slice(0, 5);

  async function copy(l: SupportLink) {
    try {
      await navigator.clipboard.writeText(supportUrl(l.token));
      toast.success(`Link for ${l.label} copied`);
    } catch {
      toast("Couldn't copy. Select the link and copy it yourself.");
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    create.mutate({ label: label.trim(), relation }, {
      onSuccess: (l) => { setLabel(""); void copy(l); },
      onError: (err) => toast.error(/too_many/.test(String((err as Error).message)) ? "You can have 5 working links at a time. Turn one off first." : "Couldn't make the link. Try again."),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-2">
        Give a parent, guardian, tutor or counselor a private link to a read-only page: how your studying is going, what's coming up, and how ready you are.
        They never see your notes, files, chats or flashcards. Links work for 90 days, and you can turn one off any time.
      </p>
      {live.length > 0 && (
        <ul className="card divide-y divide-line px-4">
          {live.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
              <span className="min-w-0 flex-1">
                <b className="block">{l.label} <span className="font-normal text-muted">· {RELATIONS.find(([k]) => k === l.relation)?.[1]}</span></b>
                <span className="block text-[0.8125rem] text-muted">
                  {l.last_viewed_at ? `Last opened ${day(l.last_viewed_at)} · opened ${l.views} ${l.views === 1 ? "time" : "times"}` : "Not opened yet"} · works until {day(l.expires_at)}
                </span>
              </span>
              <Button size="sm" variant="secondary" onClick={() => void copy(l)}>Copy link</Button>
              <RevokeButton link={l} />
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
          <span className="field-label">Who is it for?</span>
          <input className="input" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Mom, or Ms. Rivera" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="field-label">They are your</span>
          <select className="input" value={relation} onChange={(e) => setRelation(e.target.value as Relation)}>
            {RELATIONS.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
          </select>
        </label>
        <Button type="submit" disabled={!label.trim() || create.isPending}>{create.isPending ? "Making it…" : "Make a link"}</Button>
      </form>
      {past.length > 0 && <p className="text-[0.8125rem] text-muted">Turned off or expired: {past.map((l) => l.label).join(", ")}.</p>}
    </div>
  );
}

function RevokeButton({ link }: { link: SupportLink }) {
  const revoke = useRevokeSupportLink();
  const [sure, setSure] = useState(false);
  if (!sure) return <Button size="sm" variant="ghost" onClick={() => setSure(true)}>Turn off</Button>;
  return (
    <span className="flex items-center gap-2" role="alert">
      <span className="text-[0.875rem]">Turn off {link.label}'s link?</span>
      <Button size="sm" disabled={revoke.isPending} onClick={() => revoke.mutate(link.id, { onSuccess: () => toast.success("Link turned off"), onError: () => toast.error("Couldn't turn it off. Try again.") })}>Turn off</Button>
      <Button size="sm" variant="ghost" onClick={() => setSure(false)}>Keep</Button>
    </span>
  );
}
