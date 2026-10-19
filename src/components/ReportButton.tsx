import { Flag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useReportContent, type ReportItemType } from "@/lib/queries/reports";

const DONE: Record<ReportItemType, string> = {
  card: "Card hidden and reported. Thanks for flagging it.",
  quiz_question: "Question hidden and reported. Thanks for flagging it.",
  notes_section: "Note hidden and reported. Thanks for flagging it.",
  guide_section: "Section hidden and reported. Thanks for flagging it.",
  tutor_message: "Reported. Thanks for flagging it.",
};

/**
 * "Something wrong here?" A small flag that opens a one-line reason, then flags the item. Cards,
 * quiz questions, notes and guide sections are hidden for the student at once; a tutor answer just
 * gets reported (it stays part of the conversation).
 */
export function ReportButton({ itemType, itemId, subjectId, className }: { itemType: ReportItemType; itemId: string; subjectId: string | null; className?: string }) {
  const report = useReportContent();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (done) return <p className={`text-[0.8125rem] text-muted ${className ?? ""}`}>{DONE[itemType]}</p>;

  if (!open)
    return (
      <Button type="button" variant="ghost" size="sm" className={`!text-muted hover:!bg-soft hover:!text-ink ${className ?? ""}`} onClick={() => setOpen(true)}>
        <Flag /> Something wrong here?
      </Button>
    );

  return (
    <form
      className={`flex flex-col gap-2 ${className ?? ""}`}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await report(itemType, itemId, subjectId, reason.trim());
          // A hidden card, question, note or guide section vanishes from this list the moment the
          // query refetches, taking this message down with it; the toast is what the student actually sees.
          toast(DONE[itemType]);
          setDone(true);
        } catch {
          toast("We could not send that report. Check your connection, then try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor={`report-${itemId}`} className="field-label">What is wrong with it? (optional)</label>
      <textarea id={`report-${itemId}`} className="input" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. the answer is wrong, or does not match the page" />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>{busy ? "Reporting…" : itemType === "tutor_message" ? "Report" : "Report and hide"}</Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
