import { useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Share2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { shortDate } from "@/lib/calendar";
import { createShare, ShareError, shareUrl, useRevokeShare, useShareLinks } from "@/lib/queries/share";

/** Share a study set with a private link: make one, copy or share it, see how it's used, turn it off. */
export function SharePanel({ sourceId, title, onClose }: { sourceId: string; title: string; onClose: () => void }) {
  const links = useShareLinks(sourceId);
  const revoke = useRevokeShare();
  const qc = useQueryClient();
  const [withFile, setWithFile] = useState(true);
  const [busy, setBusy] = useState(false);

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      toast("Link copied.");
    } catch {
      toast(shareUrl(token));
    }
  };
  const share = async (token: string) => {
    if (navigator.share) await navigator.share({ title: `${title} on Stoga.study`, text: `A study set for ${title}`, url: shareUrl(token) }).catch(() => {});
    else await copy(token);
  };
  const make = async () => {
    setBusy(true);
    try {
      const l = await createShare(sourceId, withFile);
      await qc.invalidateQueries({ queryKey: ["share-links", sourceId] });
      await share(l.token);
    } catch (e) {
      toast(e instanceof ShareError && e.code === "too_many" ? "You have 20 links on already. Turn one off first." : "We couldn't make a link. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card flex w-full flex-col gap-4 p-5" aria-labelledby="share-h">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <h2 id="share-h" className="text-[1.25rem]">Share this study set</h2>
          <p className="text-[0.9375rem] text-muted">A private link for classmates. They get their own copy of the notes, cards, quizzes and guide. Your own notes and progress are never shared.</p>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="grid size-10 place-items-center rounded-full hover:bg-soft"><X className="size-5" /></button>
      </div>
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1 size-5 accent-[var(--primary)]" checked={withFile} onChange={(e) => setWithFile(e.target.checked)} />
        <span><b className="block">Include the original file</b><span className="text-[0.875rem] text-muted">So they can open the pages too. Only share files you're allowed to share.</span></span>
      </label>
      <Button className="self-start" disabled={busy} onClick={() => void make()}><Link2 /> {busy ? "Making a link…" : "Make a link"}</Button>
      {(links.data?.length ?? 0) > 0 && (
        <div>
          <h3 className="mb-1 font-bold">Your links</h3>
          <ul className="divide-y divide-line">
            {links.data!.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[0.8125rem]">{shareUrl(l.token).replace(/^https?:\/\//, "")}</span>
                  <span className="text-[0.8125rem] text-muted">Works until {shortDate(l.expires_at.slice(0, 10))} · added {l.copies} time{l.copies === 1 ? "" : "s"}{l.with_file ? "" : " · without the file"}</span>
                </span>
                <Button size="sm" variant="ghost" aria-label="Copy link" onClick={() => void copy(l.token)}><Copy /></Button>
                <Button size="sm" variant="ghost" aria-label="Share link" onClick={() => void share(l.token)}><Share2 /></Button>
                <Button size="sm" variant="ghost" onClick={() => revoke(l.id).then(() => toast("Link turned off. It won't work anymore.")).catch(() => toast("We couldn't turn it off. Try again."))}>Turn off</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
