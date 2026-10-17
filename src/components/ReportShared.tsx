import { Flag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

const REASONS = [
  ["inappropriate", "Inappropriate or offensive"],
  ["bullying", "Bullying or about a person"],
  ["personal_info", "Someone's personal information"],
  ["wrong", "Wrong or misleading"],
  ["spam", "Spam"],
  ["other", "Something else"],
] as const;

/** Report something another student shared. Three reports hide it until a person reviews it. */
export function ReportShared({ type, id, onHidden, compact }: { type: "group_set" | "share_link"; id: string; onHidden?: () => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("report_shared", { p_type: type, p_target: id, p_reason: reason, p_details: details || undefined });
    setBusy(false);
    if (error) return toast("We couldn't send that. Try again.");
    setOpen(false);
    toast(data ? "Thanks. It's hidden while someone takes a look." : "Thanks for telling us. Someone will take a look.");
    if (data) onHidden?.();
  };
  if (!open) return <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label="Report this"><Flag />{!compact && " Report"}</Button>;
  return (
    <div className="card mt-2 flex w-full flex-col gap-2 p-4" role="group" aria-label="Report this">
      <p className="font-bold">What's wrong with it?</p>
      <div className="flex flex-col gap-1" role="radiogroup" aria-label="Reason">
        {REASONS.map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-[0.9375rem]"><input type="radio" name={`reason-${id}`} className="size-4 accent-[var(--primary)]" checked={reason === k} onChange={() => setReason(k)} /> {label}</label>
        ))}
      </div>
      <label className="text-[0.875rem] font-bold" htmlFor={`details-${id}`}>Anything else? <span className="font-normal text-muted">(optional)</span></label>
      <textarea id={`details-${id}`} className="input !min-h-16" maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} />
      <p className="text-[0.8125rem] text-muted">Reports are private. If someone is being hurt or you feel unsafe, tell a trusted adult too.</p>
      <div className="flex gap-2"><Button size="sm" disabled={!reason || busy} onClick={() => void send()}>Send report</Button><Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button></div>
    </div>
  );
}
