import { ChevronRight, GraduationCap, Heart, LogOut, MessageSquare, Sparkles, Trash2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { describeGrade } from "@/lib/grade";
import { TEXT_LABEL, THEME_LABEL, useTextSize, useTheme, type TextSize, type ThemeChoice } from "@/lib/preferences";
import { deleteAccount, hostOf, KeyError, PROVIDER_PRESETS, useApiKey, useRemoveKey, useSaveKey, useUpdateName } from "@/lib/queries/account";
import { RETENTION_CHOICES } from "@/lib/fsrs";
import { useProfile, useRetention, useTutorDepth, type TutorDepth } from "@/lib/queries/profile";
import { supabase } from "@/lib/supabase";

const DEPTH_LABEL: Record<TutorDepth, string> = { simple: "Simple", standard: "Standard", deep: "Deep" };
const DEPTH_DESC: Record<TutorDepth, string> = {
  simple: "Short, plain explanations with the basics.",
  standard: "Matches your class level.",
  deep: "More precise and rigorous, for AP and Honors.",
};

/** Default depth for new tutor answers. "Simpler" and "Go deeper" on one answer stay one-off. */
function DepthChoice() {
  const { value, set } = useTutorDepth();
  return (
    <div className="flex flex-col gap-2">
      <span className="field-label">Tutor answer depth</span>
      <Segmented<TutorDepth>
        label="Tutor answer depth"
        value={value}
        options={["simple", "standard", "deep"]}
        labels={DEPTH_LABEL}
        onChange={(v) => set.mutate(v, { onSuccess: () => toast(`Tutor answers set to ${DEPTH_LABEL[v]}.`), onError: () => toast("We could not save that. Try again.") })}
      />
      <p className="field-hint">{DEPTH_DESC[value]} You can still ask for simpler or deeper on any one answer.</p>
    </div>
  );
}

function Segmented<T extends string>({ label, value, options, labels, onChange }: {
  label: string; value: T; options: readonly T[]; labels: Record<T, string>; onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-full border-2 border-line bg-card p-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={cn("min-h-10 rounded-full px-4 text-[0.9375rem] font-bold", value === o ? "bg-primary text-white" : "text-muted hover:text-ink")}
        >
          {labels[o]}
        </button>
      ))}
    </div>
  );
}

function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="card mt-4 flex scroll-mt-20 flex-col gap-4 p-6" aria-labelledby={`${id ?? title}-h`}>
      <h2 id={`${id ?? title}-h`} className="text-[1.375rem]">{title}</h2>
      {children}
    </section>
  );
}

function LinkRow({ to, icon, title, sub }: { to: string; icon: ReactNode; title: string; sub: string }) {
  return (
    <Link to={to} className="card mt-4 flex items-center gap-4 p-5 text-ink no-underline">
      <span className="tile soft">{icon}</span>
      <span className="flex-1">
        <span className="block font-display text-[1.25rem] font-bold">{title}</span>
        <span className="block text-muted">{sub}</span>
      </span>
      <ChevronRight className="size-5 text-muted" />
    </Link>
  );
}

function NameForm() {
  const profile = useProfile();
  const update = useUpdateName();
  const [name, setName] = useState<string | null>(null);
  const value = name ?? profile.data?.first_name ?? "";
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        update.mutate(value, { onSuccess: () => { setName(null); toast("Name saved."); }, onError: () => toast("We could not save that. Try again.") });
      }}
    >
      <div className="flex min-w-48 flex-1 flex-col gap-1.5">
        <label htmlFor="fname" className="field-label">First name</label>
        <input id="fname" className="input" autoComplete="given-name" maxLength={60} value={value} onChange={(e) => setName(e.target.value)} />
      </div>
      <Button type="submit" variant="secondary" disabled={name === null || update.isPending}>Save</Button>
    </form>
  );
}

function OwnKey() {
  const key = useApiKey();
  const save = useSaveKey();
  const remove = useRemoveKey();
  const [preset, setPreset] = useState<string>(PROVIDER_PRESETS[0].name);
  const [baseUrl, setBaseUrl] = useState<string>(PROVIDER_PRESETS[0].baseUrl);
  const [model, setModel] = useState<string>(PROVIDER_PRESETS[0].model);
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<{ message: string; field: KeyError["field"] } | null>(null);

  if (key.data) {
    const host = hostOf(key.data.base_url);
    return (
      <>
        <p>
          A key for <b>{host}</b> ending in <b className="tabular">{key.data.last4}</b> is in use with the model <b className="break-all">{key.data.model}</b>, added {new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(new Date(key.data.created_at))}.
          Your tutor answers and study sets run on it, with no Stoga.study limits.
        </p>
        <p className="field-hint">The key is stored encrypted and never shown again. Charges come from {host}, so set a monthly budget limit there. Answer quality depends on the model you chose.</p>
        <Button variant="secondary" className="self-start" disabled={remove.isPending} onClick={() => remove.mutate(undefined, { onSuccess: () => toast("Key removed. You are back on Essential."), onError: () => toast("We could not remove it. Try again.") })}>
          Remove key
        </Button>
      </>
    );
  }

  const other = preset === PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1].name;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        save.mutate({ key: value.trim(), baseUrl: baseUrl.trim(), model: model.trim() }, {
          onSuccess: () => { setValue(""); toast("Key checked and saved. You are on the Independent plan."); },
          onError: (err) => {
            const field = err instanceof KeyError ? err.field : null;
            if (field === "key" || field === null) setValue("");
            setError({ message: err.message, field });
          },
        });
      }}
    >
      <p className="text-muted">On the Independent plan, the tutor and study sets use your own API key instead of shared limits. Any OpenAI-compatible provider works. The provider bills the key holder, and most need an adult account holder, so a parent or guardian usually sets this up.</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="provider" className="field-label">Provider</label>
        <select
          id="provider"
          className="input"
          value={preset}
          onChange={(e) => {
            const p = PROVIDER_PRESETS.find((x) => x.name === e.target.value)!;
            setPreset(p.name);
            setBaseUrl(p.baseUrl);
            setModel(p.model);
            setError(null);
          }}
        >
          {PROVIDER_PRESETS.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="base-url" className="field-label">API address</label>
        <input id="base-url" className="input" type="url" inputMode="url" value={baseUrl} onChange={(e) => { setBaseUrl(e.target.value); if (!other) setPreset(PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1].name); }} placeholder="https://api.example.com/v1" autoComplete="off" spellCheck={false} aria-invalid={error?.field === "url"} aria-describedby={error?.field === "url" ? "url-hint key-error" : "url-hint"} />
        <p id="url-hint" className="field-hint">The provider's OpenAI-compatible base URL. It usually ends in /v1.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="model" className="field-label">Model</label>
        <input id="model" className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. openai/gpt-oss-120b" autoComplete="off" spellCheck={false} aria-invalid={error?.field === "model"} aria-describedby={error?.field === "model" ? "model-hint key-error" : "model-hint"} />
        <p id="model-hint" className="field-hint">The exact model name from your provider. Larger models give better answers.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="key" className="field-label">API key</label>
        <div className="flex gap-2">
          <input id="key" className="input flex-1" type={show ? "text" : "password"} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Paste your key" autoComplete="off" spellCheck={false} aria-invalid={error?.field === "key"} aria-describedby={error?.field === "key" ? "key-hint key-error" : "key-hint"} />
          <Button variant="secondary" onClick={() => setShow((s) => !s)} aria-pressed={show}>{show ? "Hide" : "Show"}</Button>
        </div>
        <p id="key-hint" className="field-hint">We check it with a tiny test request (a fraction of a cent on your account), then store it encrypted. It is never shown again.</p>
      </div>
      {error && <p id="key-error" role="alert" className="callout">{error.message}</p>}
      <Button type="submit" className="self-start" disabled={!value.trim() || !baseUrl.trim() || !model.trim() || save.isPending}>{save.isPending ? "Checking…" : "Check and save key"}</Button>
    </form>
  );
}

function DangerZone() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return <Button variant="ghost" className="self-start" onClick={() => setOpen(true)}><Trash2 /> Delete my account</Button>;
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-[1rem] border-2 border-tint-line bg-tint p-4">
      <p className="font-bold">This deletes everything: your classes, uploads, notes, cards, quizzes and tutor conversations. It cannot be undone.</p>
      <label htmlFor="confirm" className="field-label">Type “delete” to confirm</label>
      <input id="confirm" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      <div className="flex gap-2">
        <Button
          disabled={typed.trim().toLowerCase() !== "delete" || busy}
          onClick={async () => {
            setBusy(true);
            try { await deleteAccount(); } catch { setBusy(false); toast("We could not delete your account. Try again, or send feedback and we will do it for you."); }
          }}
        >
          {busy ? "Deleting…" : "Delete everything"}
        </Button>
        <Button variant="secondary" onClick={() => { setOpen(false); setTyped(""); }}>Keep my account</Button>
      </div>
    </div>
  );
}

/** Desired retention: how much to remember, traded against how many reviews. */
function RetentionChoice() {
  const { value, set } = useRetention();
  const closest = RETENTION_CHOICES.reduce((a, b) => (Math.abs(b.value - value) < Math.abs(a.value - value) ? b : a));
  return (
    <div className="flex flex-col gap-2">
      <span id="ret-label" className="field-label">How much to remember</span>
      <div className="flex flex-col gap-2" role="radiogroup" aria-labelledby="ret-label">
        {RETENTION_CHOICES.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={closest.value === c.value}
            disabled={set.isPending}
            onClick={() => set.mutate(c.value, { onSuccess: () => toast(`Reviews set to ${c.label}.`), onError: () => toast("We could not save that. Try again.") })}
            className={cn("card !shadow-none flex items-start gap-3 p-4 text-left", closest.value === c.value && "!border-primary")}
          >
            <span className={cn("mt-0.5 grid size-5 flex-none place-items-center rounded-full border-2", closest.value === c.value ? "border-primary" : "border-line-strong")}>
              {closest.value === c.value && <span className="size-2.5 rounded-full bg-primary" />}
            </span>
            <span>
              <span className="block font-bold">{c.label} · {Math.round(c.value * 100)}%</span>
              <span className="block text-[0.9375rem] text-muted">{c.desc}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="field-hint">Changes when cards come back from your next review on. Saved to your account.</p>
    </div>
  );
}

export default function Settings() {
  const [theme, setTheme] = useTheme();
  const [size, setSize] = useTextSize();
  const { session } = useAuth();
  const profile = useProfile();
  return (
    <>
      <PageHeader title="Settings" />
      <LinkRow to="/classes" icon={<GraduationCap />} title="Grade and classes" sub={profile.data?.graduation_year ? describeGrade(profile.data.graduation_year) : "Not set"} />

      <Section title="Profile"><NameForm /></Section>

      <Section title="Display">
        <div className="flex flex-col gap-2">
          <span className="field-label">Colour theme</span>
          <Segmented<ThemeChoice> label="Colour theme" value={theme} options={["system", "light", "dark"]} labels={THEME_LABEL} onChange={setTheme} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="field-label">Text size</span>
          <Segmented<TextSize> label="Text size" value={size} options={["standard", "large", "largest"]} labels={TEXT_LABEL} onChange={setSize} />
          <p className="field-hint">Layouts reflow at every size. These settings stay on this device.</p>
        </div>
      </Section>

      <Section id="review" title="Flashcard reviews"><RetentionChoice /></Section>

      <Section id="tutor" title="AI tutor"><DepthChoice /></Section>

      <Section id="own-key" title="Your own key"><OwnKey /></Section>

      <LinkRow to="/plans" icon={<Heart />} title="Plans and funding" sub={profile.data?.plan === "independent" ? "Independent, your own key" : profile.data?.plan === "unlimited" ? "Unlimited" : "Essential, free"} />
      <LinkRow to="/feedback?from=settings" icon={<MessageSquare />} title="Send feedback" sub="Report a problem or suggest an idea" />
      <LinkRow to="/changelog" icon={<Sparkles />} title="What's new" sub="Every update, in plain words" />

      <Section title="Account">
        <p className="text-muted">Signed in as <b className="break-all text-ink">{session?.user.email}</b></p>
        <p className="field-hint">You stay signed in on this device until you sign out. To sign back in, we email you a new link.</p>
        <Button variant="secondary" className="self-start" onClick={() => supabase.auth.signOut()}><LogOut /> Sign out</Button>
        <DangerZone />
      </Section>
    </>
  );
}
