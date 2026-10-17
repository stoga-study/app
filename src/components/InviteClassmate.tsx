import { Copy, MessageSquare, Share2, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { inviteMessage, smsLink } from "@/lib/invite";
import { isIOS } from "@/lib/push";
import { useProfile } from "@/lib/queries/profile";

/** Invite a classmate: a ready-made, editable message to share, copy or text. No rewards, ever. */
export function InviteClassmate({ className, groupName, url, label = "Invite a classmate" }: { className?: string | null; groupName?: string | null; url?: string; label?: string }) {
  const profile = useProfile();
  const [open, setOpen] = useState(false);
  const link = url ?? window.location.origin;
  const first = profile.data?.first_name?.split(" ")[0] ?? null;
  const [text, setText] = useState<string | null>(null);
  const message = text ?? inviteMessage({ firstName: first, className, groupName, url: link });
  if (!open) return <Button variant="secondary" size="sm" onClick={() => setOpen(true)}><UserPlus /> {label}</Button>;
  const share = async () => {
    if (navigator.share) await navigator.share({ text: message }).catch(() => {});
    else await copy();
  };
  const copy = () => navigator.clipboard.writeText(message).then(() => toast("Message copied. Paste it anywhere."), () => toast("Couldn't copy. Select the message and copy it."));
  return (
    <section className="card flex w-full flex-col gap-3 p-4" aria-label="Invite a classmate">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 font-bold">{groupName ? `Invite someone to ${groupName}` : "Invite a classmate"}</h3>
        <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-full hover:bg-soft"><X className="size-5" /></button>
      </div>
      <label htmlFor="invite-text" className="sr-only">Message</label>
      <textarea id="invite-text" className="input !min-h-28 text-[0.9375rem]" value={message} maxLength={600} onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void share()}><Share2 /> Share</Button>
        <Button size="sm" variant="secondary" onClick={() => void copy()}><Copy /> Copy</Button>
        <Button size="sm" variant="secondary" asChild><a href={smsLink(message, isIOS())}><MessageSquare /> Text it</a></Button>
      </div>
      <p className="text-[0.8125rem] text-muted">Only send it to people who'd want it. Nothing is sent by us, and nobody gets anything for inviting.</p>
    </section>
  );
}
