import { useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Share, SquarePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/session";
import { currentSubscription, needsHomeScreen, pushSupported, sendTest, turnOff, turnOn } from "@/lib/push";
import { useProfile } from "@/lib/queries/profile";
import { supabase } from "@/lib/supabase";
import { DEFAULT_PREFS, toPrefs, type NotifyPrefs } from "../../supabase/functions/_lib/notify";

/** Settings, Notifications: turn them on for this device, choose what and when, quiet hours, a test. */
export function NotificationSettings() {
  const profile = useProfile();
  const { session } = useAuth();
  const qc = useQueryClient();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const prefs = toPrefs(profile.data?.notify ?? { ...DEFAULT_PREFS, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });

  useEffect(() => {
    let alive = true;
    void currentSubscription().then((s) => alive && setOn(!!s)).catch(() => alive && setOn(false));
    return () => { alive = false; };
  }, []);

  const save = async (patch: Partial<NotifyPrefs>) => {
    const next = { ...prefs, ...patch, tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
    const { error } = await supabase.from("profiles").update({ notify: next }).eq("user_id", session!.user.id);
    if (error) return toast("We couldn't save that. Try again.");
    qc.invalidateQueries({ queryKey: ["profile"] });
  };

  if (needsHomeScreen()) {
    return (
      <div className="flex flex-col gap-3">
        <p>On iPhone, reminders work once Stoga.study is on your Home Screen:</p>
        <ol className="flex flex-col gap-2 pl-1">
          <li className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-full bg-tint font-bold text-brand">1</span> Tap <Share className="size-5" aria-label="Share" /> in Safari's toolbar.</li>
          <li className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-full bg-tint font-bold text-brand">2</span> Choose <b>Add to Home Screen</b> <SquarePlus className="size-5" aria-hidden="true" /></li>
          <li className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-full bg-tint font-bold text-brand">3</span> Open Stoga from your Home Screen and come back here.</li>
        </ol>
      </div>
    );
  }
  if (!pushSupported()) return <p className="text-muted">This browser can't show notifications. Try Chrome, Edge, Firefox, or Safari on a Mac or iPhone.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-[15rem] flex-1">{on ? "Reminders are on for this device." : "Get a gentle reminder in the evening, a heads-up the night before a test, and the odd check-in from your coach. Never more than one a day."}</p>
        {on ? (
          <>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => { setBusy(true); sendTest().then((n) => toast(n ? "Sent. It should arrive in a moment." : "Couldn't reach this device. Try turning notifications off and on.")).catch(() => toast("We couldn't send a test.")).finally(() => setBusy(false)); }}>Send a test</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setBusy(true); turnOff().then(() => setOn(false)).finally(() => setBusy(false)); }}><BellOff /> Turn off</Button>
          </>
        ) : (
          <Button disabled={busy} onClick={() => {
            setBusy(true);
            turnOn()
              .then(async (r) => {
                if (r === "on") { setOn(true); if (!profile.data?.notify) await save({}); toast("Reminders are on."); }
                else if (r === "denied") toast("Notifications are blocked. Allow them for this site in your browser's settings, then try again.");
                else toast("This browser can't show notifications.");
              })
              .catch(() => toast("We couldn't turn them on. Try again."))
              .finally(() => setBusy(false));
          }}><Bell /> Turn on reminders</Button>
        )}
      </div>
      {on && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-bold">What to send</legend>
            {([["study", "Evening study reminder", "Only if you have cards due and haven't studied yet that day."], ["tests", "Test tomorrow", "The evening before a test or quiz on your calendar."], ["checkins", "Check-ins from your coach", "After a rough quiz, when a test is close and you've been away a couple of days, or after a quiet stretch. At most one a week of each."]] as const).map(([k, label, hint]) => (
              <label key={k} className="flex items-start gap-3">
                <input type="checkbox" className="mt-1 size-5 accent-[var(--primary)]" checked={prefs[k]} onChange={(e) => void save({ [k]: e.target.checked })} />
                <span><b className="block">{label}</b><span className="text-[0.875rem] text-muted">{hint}</span></span>
              </label>
            ))}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1"><span className="font-bold">Remind me at</span><input type="time" className="input" value={prefs.time} onChange={(e) => e.target.value && void save({ time: e.target.value })} /></label>
            <label className="flex flex-col gap-1"><span className="font-bold">Quiet from</span><input type="time" className="input" value={prefs.quiet_start} onChange={(e) => e.target.value && void save({ quiet_start: e.target.value })} /></label>
            <label className="flex flex-col gap-1"><span className="font-bold">Until</span><input type="time" className="input" value={prefs.quiet_end} onChange={(e) => e.target.value && void save({ quiet_end: e.target.value })} /></label>
          </div>
          <p className="field-hint">Nothing is sent during quiet hours. Times follow this device's time zone ({prefs.tz}).</p>
        </>
      )}
    </div>
  );
}
