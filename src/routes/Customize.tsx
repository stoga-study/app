import { ArrowLeft, Check } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { Face } from "@/components/Face";
import { FaceEditor } from "@/components/FaceEditor";
import { PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { LENGTHS, VIBE_LABEL, VIBES, type CoachSettings, type Face as FaceT } from "@/lib/face";
import { useFaces, useProfile, useSaveFaces } from "@/lib/queries/profile";

const LENGTH_LABEL = { short: "Short", normal: "Normal", detailed: "Detailed" } as const;
const NAME_IDEAS = ["Juno", "Milo", "Sage", "Remy", "Nova", "Theo", "Kai", "Pip"];

/** /coach/customize: the coach's face, name, personality and reply length, with a live preview. */
export function CustomizeCoach() {
  const faces = useFaces();
  const profile = useProfile();
  const save = useSaveFaces();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<CoachSettings | null>(null);
  if (!faces.ready) return <PageSkeleton label="Getting your coach." />;
  const c = draft ?? faces.coach;
  const set = (patch: Partial<CoachSettings>) => setDraft({ ...c, ...patch });
  const name = c.name.trim() || "Coach";

  return (
    <section className="mx-auto max-w-4xl" aria-label="Customize your coach">
      <Link to="/coach" className="mb-4 inline-flex min-h-11 items-center gap-2 font-bold text-ink-2 no-underline"><ArrowLeft className="size-5" /> Coach</Link>
      <h1 className="text-[2.125rem] md:text-[2.75rem]">Make it yours</h1>
      <p className="mb-6 mt-1 text-muted">Pick how your coach looks, what it's called and how it talks to you.</p>

      <div className="card mb-6 flex items-center gap-4 p-5">
        <Face face={c.face} size={56} mood="talking" />
        <p className="rise text-[1.0625rem]" key={`${name}-${c.vibe}`}>
          {c.vibe === "hype" ? `Let's GO, ${profile.data?.first_name ?? "friend"}! I'm ${name}, and we're crushing this week.`
            : c.vibe === "direct" ? `${name} here. Tell me what's due and I'll tell you what to do first.`
              : c.vibe === "calm" ? `Hi ${profile.data?.first_name ?? "there"}, I'm ${name}. One thing at a time; we'll get there.`
                : `Hey ${profile.data?.first_name ?? "there"}, I'm ${name}. What's on your plate?`}
        </p>
      </div>

      <section className="card mb-6 p-5" aria-labelledby="c-face">
        <h2 id="c-face" className="mb-4 text-[1.375rem]">Face</h2>
        <FaceEditor value={c.face} onChange={(face: FaceT) => set({ face })} title={`${name}'s face`} />
      </section>

      <section className="card mb-6 p-5" aria-labelledby="c-name">
        <h2 id="c-name" className="mb-2 text-[1.375rem]"><label htmlFor="coach-name">Name</label></h2>
        <input id="coach-name" className="input w-full max-w-sm" maxLength={24} value={c.name} onChange={(e) => set({ name: e.target.value })} />
        <div className="mt-3 flex flex-wrap gap-2">
          {NAME_IDEAS.map((n) => <button key={n} type="button" className="pill-option !min-h-9" aria-pressed={c.name === n} onClick={() => set({ name: n })}>{n}</button>)}
        </div>
      </section>

      <section className="card mb-6 p-5" aria-labelledby="c-vibe">
        <h2 id="c-vibe" className="mb-3 text-[1.375rem]">Personality</h2>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-labelledby="c-vibe">
          {VIBES.map((v) => (
            <button key={v} type="button" role="radio" aria-checked={c.vibe === v} onClick={() => set({ vibe: v })}
              className={cn("card flex items-start gap-3 !rounded-[1rem] p-4 text-left !shadow-none transition-transform hover:-translate-y-0.5", c.vibe === v && "!border-primary bg-tint")}>
              <span className={cn("mt-0.5 grid size-6 flex-none place-items-center rounded-full border-2", c.vibe === v ? "border-primary bg-primary text-white" : "border-line")}>{c.vibe === v && <Check className="size-4" />}</span>
              <span><b className="block">{VIBE_LABEL[v].name}</b><span className="text-[0.9375rem] text-muted">{VIBE_LABEL[v].blurb}</span></span>
            </button>
          ))}
        </div>
        <h3 className="mb-2 mt-5 font-bold">Reply length</h3>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Reply length">
          {LENGTHS.map((l) => <button key={l} type="button" role="radio" aria-checked={c.length === l} className="pill-option" onClick={() => set({ length: l })}>{LENGTH_LABEL[l]}</button>)}
        </div>
      </section>

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] flex gap-2 bg-bg py-3 lg:bottom-0">
        <Button disabled={!draft || save.isPending} onClick={() => save.mutate({ coach: { ...c, name } }, { onSuccess: () => { toast(`Saved. Say hi to ${name}.`); navigate("/coach"); }, onError: () => toast("We couldn't save that. Check your connection, then try again.") })}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <Button variant="secondary" disabled={!draft} onClick={() => setDraft(null)}>Reset</Button>
      </div>
    </section>
  );
}

/** /settings/face: the student's own face, shown in the top bar. */
export function YourFace() {
  const faces = useFaces();
  const save = useSaveFaces();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<FaceT | null>(null);
  if (!faces.ready) return <PageSkeleton label="Getting your face." />;
  const f = draft ?? faces.me;
  return (
    <section className="mx-auto max-w-4xl" aria-label="Your face">
      <Link to="/settings" className="mb-4 inline-flex min-h-11 items-center gap-2 font-bold text-ink-2 no-underline"><ArrowLeft className="size-5" /> Settings</Link>
      <h1 className="text-[2.125rem] md:text-[2.75rem]">Your face</h1>
      <p className="mb-6 mt-1 text-muted">Shows at the top of the app. Only you see it.</p>
      <div className="card p-5"><FaceEditor value={f} onChange={setDraft} title="Your face" /></div>
      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] mt-4 flex gap-2 bg-bg py-3 lg:bottom-0">
        <Button disabled={(!draft && faces.hasOwnFace) || save.isPending} onClick={() => save.mutate({ avatar: f }, { onSuccess: () => { toast("Looking good."); navigate("/settings"); }, onError: () => toast("We couldn't save that. Check your connection, then try again.") })}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </section>
  );
}
