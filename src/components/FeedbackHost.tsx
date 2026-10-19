import { X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { captureScreen, sendFeedback, type FeedbackKind } from "@/lib/feedback";

/** The feedback sheet, available on every screen. Opened with openFeedback() from anywhere. */
export function FeedbackHost() {
  const [open, setOpen] = useState<FeedbackKind | null>(null);
  useEffect(() => {
    const on = (e: Event) => setOpen(((e as CustomEvent).detail?.kind as FeedbackKind) ?? "bug");
    window.addEventListener("stoga:feedback", on);
    return () => window.removeEventListener("stoga:feedback", on);
  }, []);
  return open ? <FeedbackSheet initial={open} onClose={() => setOpen(null)} /> : null;
}

function FeedbackSheet({ initial, onClose }: { initial: FeedbackKind; onClose: () => void }) {
  const location = useLocation();
  const page = location.pathname + location.search;
  const [kind, setKind] = useState<"bug" | "idea">(initial === "idea" ? "idea" : "bug");
  const [body, setBody] = useState("");
  const [shot, setShot] = useState<Blob | null>(null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [sending, setSending] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector("textarea")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, [onClose]);
  useEffect(() => () => { if (shotUrl) URL.revokeObjectURL(shotUrl); }, [shotUrl]);

  async function toggleShot(on: boolean) {
    if (!on) { setShot(null); setShotUrl(null); return; }
    setCapturing(true);
    const blob = await captureScreen();
    setCapturing(false);
    if (!blob) { toast("Couldn't take a screenshot of this screen. You can still send your message."); return; }
    setShot(blob);
    setShotUrl(URL.createObjectURL(blob));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (body.trim().length < 3) return;
    setSending(true);
    try {
      await sendFeedback({ kind, body, page, screenshot: shot });
      toast.success("Thanks. It went straight to the people building Stoga.study");
      onClose();
    } catch {
      toast.error("Couldn't send that. Check your connection and try again. Your message is still here.");
      setSending(false);
    }
  }

  return (
    <div data-feedback-exclude className={`fixed inset-0 z-[70] flex items-end justify-center p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:items-center ${capturing ? "invisible" : ""}`} style={{ background: "rgb(15 10 12 / 0.45)" }} onClick={onClose}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="fb-title" className="card sheet-in w-full max-w-[30rem] !rounded-[1.375rem] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h2 id="fb-title" className="text-[1.5rem]">Send feedback</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 grid size-9 place-items-center rounded-full text-muted hover:bg-soft hover:text-ink"><X className="size-4" /></button>
        </div>
        <form onSubmit={submit} className="mt-3 flex flex-col gap-4">
          <div role="radiogroup" aria-label="Type of feedback" className="flex gap-2">
            {([["bug", "Something's wrong"], ["idea", "An idea"]] as const).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className="pill-option">{label}</button>
            ))}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="field-label">{kind === "bug" ? "What happened, and what did you expect?" : "What would make studying easier?"}</span>
            <textarea className="input !min-h-32" maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <label className="flex items-start gap-3 text-[0.9375rem]">
            <input type="checkbox" className="mt-1 size-5 accent-[var(--primary)]" checked={!!shot} disabled={capturing} onChange={(e) => void toggleShot(e.target.checked)} />
            <span>
              <b className="block font-semibold">Include a screenshot of this screen</b>
              <span className="text-[0.8125rem] text-muted">It shows what's on your screen right now. Only the Stoga.study team sees it.</span>
            </span>
          </label>
          {shotUrl && <img src={shotUrl} alt="Screenshot that will be sent" className="max-h-48 self-start rounded-[0.625rem] border border-line object-contain" />}
          <p className="text-[0.8125rem] text-muted">We'll also see which screen you were on ({page.length > 40 ? `${page.slice(0, 40)}…` : page}), the app version and your device type.</p>
          <Button type="submit" disabled={body.trim().length < 3 || sending || capturing} className="self-start">{sending ? "Sending…" : "Send"}</Button>
        </form>
      </div>
    </div>
  );
}
