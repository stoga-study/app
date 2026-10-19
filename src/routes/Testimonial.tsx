import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { gradeFor } from "@/lib/grade";
import { useProfile } from "@/lib/queries/profile";
import { supabase } from "@/lib/supabase";
import { displayName, type Display } from "@/lib/testimonials";

type Mine = { id: string; quote: string; display_name: string; status: "review" | "approved" | "rejected" | "withdrawn"; created_at: string };
const STATUS: Record<Mine["status"], string> = { review: "Being checked", approved: "On stoga.study", rejected: "Not used", withdrawn: "Withdrawn" };

/** /testimonial: share what you think of Stoga.study for the website, with clear consent. */
export default function Testimonial() {
  const { session } = useAuth();
  const profile = useProfile();
  const qc = useQueryClient();
  const mine = useQuery({
    queryKey: ["testimonials", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("testimonials").select("id, quote, display_name, status, created_at").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Mine[];
    },
  });
  const [quote, setQuote] = useState("");
  const [display, setDisplay] = useState<Display>("name_grade");
  const [selfOk, setSelfOk] = useState(false);
  const [guardianOk, setGuardianOk] = useState(false);
  const grade = gradeFor(profile.data?.graduation_year);
  const name = displayName(display, profile.data?.first_name, grade);

  const share = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("testimonials").insert({ quote: quote.trim(), display, display_name: name, self_ok: selfOk, guardian_ok: guardianOk });
      if (error) throw error;
    },
    onSuccess: () => { setQuote(""); setSelfOk(false); setGuardianOk(false); toast.success("Thank you. We'll check it before it appears anywhere"); return qc.invalidateQueries({ queryKey: ["testimonials"] }); },
    onError: () => toast.error("Couldn't send that. Try again."),
  });
  const withdraw = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("withdraw_testimonial", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Withdrawn. It won't be used"); return qc.invalidateQueries({ queryKey: ["testimonials"] }); },
  });
  const ready = quote.trim().length >= 10 && selfOk && guardianOk;
  const submit = (e: FormEvent) => { e.preventDefault(); if (ready) share.mutate(); };

  return (
    <>
      <PageHeader title="Say something about Stoga.study">If Stoga.study has helped you, a sentence or two helps other Conestoga students find it. It's completely optional.</PageHeader>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <form onSubmit={submit} className="card flex flex-col gap-5 p-6">
          <label className="flex flex-col gap-1.5">
            <span className="field-label">What would you tell a friend about it?</span>
            <textarea className="input !min-h-28" maxLength={400} value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="For example: The plan for my bio test told me exactly what to do each night." />
            <span className="field-hint">{quote.trim().length}/400</span>
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="field-label mb-1">How should we name you?</legend>
            {(["name_grade", "grade", "anonymous"] as Display[]).map((d) => (
              <label key={d} className={cn("flex items-center gap-3 rounded-[0.75rem] border px-3 py-2.5", display === d ? "border-primary bg-tint" : "border-line")}>
                <input type="radio" name="display" checked={display === d} onChange={() => setDisplay(d)} className="accent-[var(--primary)]" />
                <span>{displayName(d, profile.data?.first_name, grade)}</span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 size-5 accent-[var(--primary)]" checked={selfOk} onChange={(e) => setSelfOk(e.target.checked)} /><span>I'm OK with this quote appearing on stoga.study as “{name}”.</span></label>
            <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 size-5 accent-[var(--primary)]" checked={guardianOk} onChange={(e) => setGuardianOk(e.target.checked)} /><span>A parent or guardian knows and is OK with it too.</span></label>
          </div>
          <Button type="submit" className="self-start" disabled={!ready || share.isPending}>{share.isPending ? "Sending…" : "Share it"}</Button>
          <p className="field-hint">The team reads every quote before it's used, and may leave some out. You can withdraw it here at any time, and it comes off the site.</p>
        </form>
        {(mine.data?.length ?? 0) > 0 && (
          <section className="card p-5" aria-labelledby="mine-h">
            <h2 id="mine-h" className="text-[1.125rem]">What you've shared</h2>
            <ul className="mt-2 flex flex-col divide-y divide-line">
              {mine.data!.map((t) => (
                <li key={t.id} className="py-3">
                  <p className="text-[0.9375rem]">“{t.quote}”</p>
                  <p className="mt-1 text-[0.8125rem] text-muted">{t.display_name} · {STATUS[t.status]}</p>
                  {(t.status === "review" || t.status === "approved") && <Button size="sm" variant="ghost" className="-ml-3 mt-1" disabled={withdraw.isPending} onClick={() => withdraw.mutate(t.id)}>Withdraw</Button>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
