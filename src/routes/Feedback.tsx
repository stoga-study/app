import { Bug, Check, Lightbulb, MessageSquareHeart } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { sendFeedback } from "@/lib/feedback";

type Kind = "bug" | "idea" | "testimonial";
const KINDS: [Kind, string, ReactNode, string][] = [
  ["bug", "Something is wrong", <Bug key="b" />, "What happened, and what did you expect?"],
  ["idea", "An idea", <Lightbulb key="i" />, "What would make studying easier?"],
  ["testimonial", "Say something nice", <MessageSquareHeart key="t" />, "How has Stoga.study helped you?"],
];

export default function Feedback() {
  const [params] = useSearchParams();
  const [kind, setKind] = useState<Kind>((params.get("kind") as Kind) || "bug");
  const [body, setBody] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const placeholder = KINDS.find((k) => k[0] === kind)![3];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (body.trim().length < 3) return;
    setState("sending");
    try {
      await sendFeedback({ kind, body, page: params.get("from") ?? "", consent: kind === "testimonial" && consent });
      setState("sent");
    } catch {
      setState("error");
    }
  }

  if (state === "sent")
    return (
      <section className="mx-auto flex max-w-xl flex-col items-start gap-4">
        <span className="tile"><Check /></span>
        <h1 className="text-[2rem]">Thank you</h1>
        <p className="text-muted">We read every message. It goes straight to the people building Stoga.study.</p>
        <Button asChild><Link to="/">Back to today</Link></Button>
      </section>
    );

  return (
    <>
      <PageHeader title="Send feedback">Tell us what is broken, what you want, or what is working.</PageHeader>
      <form onSubmit={submit} className="flex max-w-xl flex-col gap-5">
        <div role="radiogroup" aria-label="Type of feedback" className="flex flex-wrap gap-2">
          {KINDS.map(([k, label, icon]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className="pill-option">{icon}{label}</button>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="fb" className="field-label">Your message</label>
          <textarea id="fb" className="input !min-h-40" maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={placeholder} />
        </div>
        {kind === "testimonial" && (
          <label className="flex items-start gap-3 text-[0.9375rem]">
            <input type="checkbox" className="mt-1 size-5 accent-[var(--primary)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            You may share this on stoga.study with my first name and grade.
          </label>
        )}
        {state === "error" && <p role="alert" className="callout">We could not send that. Check your connection, then try again. Your message is still here.</p>}
        <Button type="submit" className="self-start" disabled={body.trim().length < 3 || state === "sending"}>{state === "sending" ? "Sending…" : "Send feedback"}</Button>
      </form>
    </>
  );
}
