import { ChevronRight, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/session";
import { clearCoachChat, useDeleteAllThreads, useShareStudySets, useTutorChatCount } from "@/lib/queries/privacy";

/** Settings > Privacy: sharing study sets, deleting conversations, and how the AI uses data. */
export function PrivacySettings() {
  return (
    <>
      <ShareToggle />
      <TutorChats />
      <CoachChat />
      <p className="text-muted">To delete one file and everything made from it, open the file and choose Delete. Deleting your account (below) removes everything.</p>
      <Link to="/privacy" className="card flex items-center gap-3 !rounded-[1rem] p-3 text-ink no-underline !shadow-none hover:!border-primary">
        <span className="tile soft"><ShieldCheck /></span>
        <span className="flex-1"><b className="block">How Stoga.study uses your data</b><span className="text-[0.875rem] text-muted">What the AI sees, what's kept, and what's never shared</span></span>
        <ChevronRight className="text-muted" aria-hidden="true" />
      </Link>
    </>
  );
}

function ShareToggle() {
  const { on, loading, set } = useShareStudySets();
  const [confirmOff, setConfirmOff] = useState(false);
  const change = (next: boolean) =>
    set.mutate(next, {
      onSuccess: (removed) => {
        setConfirmOff(false);
        toast.success(next ? "Your study sets can help classmates again" : removed ? `Turned off, and ${removed === 1 ? "1 study set" : `${removed} study sets`} you shared ${removed === 1 ? "was" : "were"} removed` : "Turned off");
      },
      onError: () => toast.error("Couldn't change that. Try again."),
    });
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1" checked={on} disabled={loading || set.isPending} onChange={(e) => (e.target.checked ? change(true) : setConfirmOff(true))} />
        <span>
          <b className="block">Let classmates with the same file use my study sets</b>
          <span className="text-[0.875rem] text-muted">
            When someone uploads the exact same file and asks for the same things, they get a copy of the notes, cards and quiz the AI made for you, straight
            away. Only what the AI made is shared: never your name, your edits, your own notes or your progress.
          </span>
        </span>
      </label>
      {confirmOff && (
        <div role="alert" className="flex flex-col gap-3 rounded-[1rem] border-2 border-tint-line bg-tint p-4">
          <p>This also removes study sets of yours that are already offered. Copies classmates already made are theirs and stay.</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={set.isPending} onClick={() => change(false)}>Turn off</Button>
            <Button variant="secondary" onClick={() => setConfirmOff(false)}>Keep it on</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TutorChats() {
  const count = useTutorChatCount();
  const del = useDeleteAllThreads();
  const [confirm, setConfirm] = useState(false);
  const n = count.data ?? 0;
  return (
    <div className="flex flex-col gap-2">
      <b>Tutor conversations</b>
      <p className="text-[0.875rem] text-muted">
        {n ? `You have ${n === 1 ? "1 conversation" : `${n} conversations`}. ` : "You have no saved conversations. "}
        Delete one at a time from <Link to="/tutor" className="underline">the tutor</Link>, or all of them here.
      </p>
      {!!n && (confirm ? (
        <div role="alert" className="flex flex-wrap items-center gap-2">
          <span>Delete all {n} for good?</span>
          <Button
            disabled={del.isPending}
            onClick={() => del.mutate(undefined, { onSuccess: () => { setConfirm(false); toast.success("Tutor conversations deleted"); }, onError: () => toast.error("Couldn't delete them. Try again.") })}
          >
            Delete all
          </Button>
          <Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button>
        </div>
      ) : (
        <Button variant="ghost" className="self-start" onClick={() => setConfirm(true)}><Trash2 /> Delete all tutor conversations</Button>
      ))}
    </div>
  );
}

function CoachChat() {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <b>Coach conversation</b>
      <p className="text-[0.875rem] text-muted">Clears your chat with the coach on all your devices. Things the coach added for you, like calendar items, stay.</p>
      <Button
        variant="ghost"
        className="self-start"
        disabled={busy || !session}
        onClick={async () => {
          setBusy(true);
          try { await clearCoachChat(session!.user.id); toast.success("Coach conversation cleared"); } catch { toast.error("Couldn't clear it. Try again."); } finally { setBusy(false); }
        }}
      >
        <Trash2 /> Clear coach conversation
      </Button>
    </div>
  );
}
