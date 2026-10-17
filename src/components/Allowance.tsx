import { useQuery } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { Link } from "react-router";
import { useAuth } from "@/lib/auth/session";
import { dateFormat } from "@/lib/locale";
import { useProfile } from "@/lib/queries/profile";
import { useAllowance } from "@/lib/queries/sources";
import { supabase } from "@/lib/supabase";

function useMeters() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["usage-meters", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("usage_meters");
      if (error) throw error;
      return data[0] ?? null;
    },
  });
}

function Meter({ label, used, limit, note }: { label: string; used: number; limit: number | null; note: string }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3"><span>{label}</span><b className="tabular">{limit == null ? "No limit" : `${used} of ${limit}`}</b></div>
      {limit != null && <div className={`bar mt-2 ${pct >= 90 ? "accent" : ""}`} role="img" aria-label={`${label}: ${used} of ${limit}`}><span style={{ width: `${pct}%` }} /></div>}
      <p className="mt-1 text-[0.8125rem] text-muted">{note}</p>
    </div>
  );
}

/** Every limit on the student's plan, plainly: what's used, what's left, and when it resets. */
export function AllowanceMeters() {
  const allowance = useAllowance();
  const meters = useMeters();
  const profile = useProfile();
  const ownKey = profile.data?.plan === "independent";
  const fmt = (iso: string) => dateFormat({ month: "long", day: "numeric" }).format(new Date(iso));
  const tutor = allowance.data?.tutor_message, uploads = allowance.data?.upload, m = meters.data;
  if (allowance.isPending || meters.isPending) return <div className="skeleton h-40 rounded-[1rem]" />;
  return (
    <div className="flex flex-col gap-5">
      {ownKey && (
        <p className="callout"><KeyRound /><span><b>Your own key is on.</b> Stoga.study's limits don't apply; your provider bills you. {m ? `This month: ${m.own_calls} AI ${m.own_calls === 1 ? "call" : "calls"}, about ${Math.round(Number(m.own_tokens) / 1000)}k tokens.` : ""} <Link to="/settings#own-key">Manage it</Link></span></p>
      )}
      {tutor && <Meter label="Tutor and coach messages today" used={tutor.used} limit={ownKey ? null : tutor.limit} note="Shared by the tutor and the coach. Resets at midnight." />}
      {uploads && <Meter label="Study sets this month" used={uploads.used} limit={ownKey ? null : uploads.limit} note={`Making notes, cards or quizzes from a file. Saving files is always free. Resets on ${fmt(uploads.resetsAt)}.`} />}
      {m && <Meter label="Scanned pages, last 24 hours" used={m.scan_pages} limit={m.scan_limit} note="Photos and scanned PDFs read into text. Frees up a page at a time over the day." />}
      {m && <Meter label="Answer checks today" used={m.checks} limit={ownKey ? null : m.checks_limit} note="Typed answers checked by the AI in Practice and practice tests. Resets at midnight UTC." />}
      {m?.cap_cards != null && (
        <div>
          <p>Most from one file</p>
          <p className="mt-1 text-[0.9375rem] text-muted tabular">{m.cap_cards} flashcards · {m.cap_quiz} quiz questions · {m.cap_guide} study guide sections</p>
        </div>
      )}
      <p className="text-[0.9375rem] text-muted">At a limit, your cards, notes and quizzes still work. Only new AI answers wait.</p>
    </div>
  );
}
