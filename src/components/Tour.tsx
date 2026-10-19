import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/session";
import { openFeedback } from "@/lib/feedback";
import { useProfile } from "@/lib/queries/profile";
import { supabase } from "@/lib/supabase";

/** Replay the tour from anywhere (Settings). */
export const openTour = () => window.dispatchEvent(new Event("stoga:tour"));

type Step = { title: string; body: string; cta?: { label: string; to?: string; feedback?: boolean } };
const STEPS: Step[] = [
  { title: "Your Conestoga classes are already here", body: "Stoga.study knows the CHS course list, so your classes and their levels are set. Add your notes, slides or a photo of a handout to any class, and it's organised by unit for you.", cta: { label: "Add notes", to: "/upload" } },
  { title: "Plans around your real test dates", body: "Put your tests and homework on the calendar, or import your Schoology calendar. Your study plan and the coach work back from those dates, so you know what to do tonight.", cta: { label: "Open the calendar", to: "/calendar" } },
  { title: "Answers from your own notes", body: "Flashcards, practice quizzes and the tutor all come from your class materials, with the page they came from. The tutor gives hints first, so you work it out yourself.", cta: { label: "See review", to: "/review" } },
  { title: "It's a beta, and you shape it", body: "If something's off or you have an idea, tell us from any screen with the feedback button, or vote on the ideas board.", cta: { label: "Send feedback", feedback: true } },
];

/** A short tour for new students, shown once on Home after setup. Replayable from Settings. */
export function Tour() {
  const { session } = useAuth();
  const profile = useProfile();
  const location = useLocation();
  const [replay, setReplay] = useState(false);
  useEffect(() => {
    const on = () => setReplay(true);
    window.addEventListener("stoga:tour", on);
    return () => window.removeEventListener("stoga:tour", on);
  }, []);
  const p = profile.data;
  const firstTime = !!p && p.onboarded && !p.tour_seen_at && location.pathname === "/";
  if (!session || (!firstTime && !replay)) return null;
  return <TourCard userId={session.user.id} markSeen={!p?.tour_seen_at} onDone={() => setReplay(false)} />;
}

function TourCard({ userId, markSeen, onDone }: { userId: string; markSeen: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [i, setI] = useState(0);
  const [closed, setClosed] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  async function finish(then?: () => void) {
    setClosed(true);
    onDone();
    if (markSeen) {
      await supabase.from("profiles").update({ tour_seen_at: new Date().toISOString() }).eq("user_id", userId);
      void qc.invalidateQueries({ queryKey: ["profile"] });
    }
    then?.();
  }
  useEffect(() => {
    card.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void finish();
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, STEPS.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (closed) return null;

  const go = () => {
    const c = step.cta;
    if (!c) return;
    void finish(() => (c.feedback ? openFeedback("idea") : navigate(c.to!)));
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:items-center" style={{ background: "rgb(15 10 12 / 0.45)" }}>
      <div ref={card} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" className="card sheet-in w-full max-w-[30rem] !rounded-[1.375rem] p-6 outline-none">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">Welcome to Stoga.study · {i + 1} of {STEPS.length}</p>
          <button type="button" onClick={() => void finish()} aria-label="Close the tour" className="-mr-2 grid size-9 place-items-center rounded-full text-muted hover:bg-soft hover:text-ink"><X className="size-4" /></button>
        </div>
        <h2 id="tour-title" className="mt-2 text-[1.625rem] leading-[1.12]">{step.title}</h2>
        <p id="tour-body" className="mt-2 text-ink-2">{step.body}</p>
        <div className="mt-5 flex gap-1.5" aria-hidden="true">
          {STEPS.map((_, k) => <span key={k} className={`h-1 flex-1 rounded-full ${k <= i ? "bg-primary" : "bg-line"}`} />)}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {last ? <Button onClick={() => void finish()}>Start studying</Button> : <Button onClick={() => setI(i + 1)}>Next</Button>}
          {step.cta && <Button variant="secondary" onClick={go}>{step.cta.label}</Button>}
          {i > 0 && <Button variant="ghost" onClick={() => setI(i - 1)}>Back</Button>}
          {!last && <button type="button" onClick={() => void finish()} className="ml-auto text-[0.875rem] text-muted underline hover:text-ink">Skip the tour</button>}
        </div>
      </div>
    </div>
  );
}
