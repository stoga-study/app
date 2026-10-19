import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/session";
import { today } from "@/lib/calendar";
import { cn } from "@/lib/cn";
import { useEvents } from "@/lib/queries/events";
import { supabase } from "@/lib/supabase";
import { dueSurvey, type Survey } from "@/lib/surveys";

function useAnswered() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["surveys", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("survey_responses").select("survey_id");
      if (error) throw error;
      return new Set(data.map((r) => r.survey_id));
    },
  });
}

/** An optional survey on Home, when one is due. Never a pop-up: "Not now" hides it for good. */
export function SurveyCard() {
  const { session } = useAuth();
  const answered = useAnswered();
  const events = useEvents();
  if (!session || !answered.data || !events.data) return null;
  const survey = dueSurvey({
    today: today(),
    joinedAt: session.user.created_at,
    pastTests: events.data.filter((e) => e.kind === "test" || e.kind === "quiz").map((e) => ({ title: e.title, due_on: e.due_on })),
    answered: answered.data,
  });
  return survey ? <SurveyBody key={survey.id} survey={survey} /> : null;
}

function SurveyBody({ survey }: { survey: Survey }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const save = useMutation({
    mutationFn: async (dismissed: boolean) => {
      const { error } = await supabase.from("survey_responses").insert({ survey_id: survey.id, answers: dismissed ? {} : answers, dismissed });
      if (error) throw error;
    },
    onSuccess: (_d, dismissed) => {
      if (!dismissed) toast.success("Thank you. That really helps");
      return qc.invalidateQueries({ queryKey: ["surveys"] });
    },
    onError: () => toast.error("Couldn't save that. Try again."),
  });
  const required = survey.questions.filter((q) => q.kind !== "text");
  const complete = required.every((q) => answers[q.id] !== undefined);

  return (
    <section className="card mt-4 p-5" aria-labelledby={`survey-${survey.id}`}>
      <p className="eyebrow">Optional</p>
      <h2 id={`survey-${survey.id}`} className="mt-1 text-[1.25rem]">{survey.title}</h2>
      {!open ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setOpen(true)}>Answer</Button>
          <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => save.mutate(true)}>Not now</Button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-5">
          {survey.questions.map((q) => (
            <fieldset key={q.id} className="flex flex-col gap-2">
              <legend className="mb-1 font-semibold">{q.text}</legend>
              {q.kind === "scale" && (
                <div>
                  <div role="radiogroup" aria-label={q.text} className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={answers[q.id] === n} onClick={() => setAnswers({ ...answers, [q.id]: n })}
                        className={cn("grid size-11 place-items-center rounded-[0.75rem] border font-semibold tabular-nums", answers[q.id] === n ? "border-primary bg-tint text-brand" : "border-line-strong bg-card hover:bg-soft")}>{n}</button>
                    ))}
                  </div>
                  <div className="mt-1 flex max-w-[16.5rem] justify-between text-[0.75rem] text-muted"><span>{q.low}</span><span>{q.high}</span></div>
                </div>
              )}
              {q.kind === "choice" && (
                <div role="radiogroup" aria-label={q.text} className="flex flex-wrap gap-2">
                  {q.options.map((o) => <button key={o} type="button" role="radio" aria-checked={answers[q.id] === o} onClick={() => setAnswers({ ...answers, [q.id]: o })} className="pill-option">{o}</button>)}
                </div>
              )}
              {q.kind === "text" && (
                <textarea className="input !min-h-20" maxLength={500} value={String(answers[q.id] ?? "")} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder="Optional" aria-label={q.text} />
              )}
            </fieldset>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!complete || save.isPending} onClick={() => save.mutate(false)}>Send</Button>
            <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => save.mutate(true)}>Not now</Button>
          </div>
        </div>
      )}
    </section>
  );
}
