import { LogOut } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/cn";
import { TEXT_LABEL, THEME_LABEL, useTextSize, useTheme, type TextSize, type ThemeChoice } from "@/lib/preferences";

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
          className={cn(
            "min-h-10 rounded-full px-4 text-[0.9375rem] font-bold",
            value === o ? "bg-primary text-white" : "text-muted hover:text-ink",
          )}
        >
          {labels[o]}
        </button>
      ))}
    </div>
  );
}

export default function Settings() {
  const [theme, setTheme] = useTheme();
  const [size, setSize] = useTextSize();
  const { session } = useAuth();
  return (
    <>
      <PageHeader title="Settings" />
      <section className="card flex flex-col gap-6 p-6" aria-labelledby="display-title">
        <h2 id="display-title" className="text-[1.375rem]">Display</h2>
        <div className="flex flex-col gap-2">
          <span className="field-label">Colour theme</span>
          <Segmented<ThemeChoice> label="Colour theme" value={theme} options={["system", "light", "dark"]} labels={THEME_LABEL} onChange={setTheme} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="field-label">Text size</span>
          <Segmented<TextSize> label="Text size" value={size} options={["standard", "large", "largest"]} labels={TEXT_LABEL} onChange={setSize} />
          <p className="field-hint">Layouts reflow at every size. These settings stay on this device.</p>
        </div>
      </section>

      <section className="card mt-4 flex flex-col gap-3 p-6" aria-labelledby="account-title">
        <h2 id="account-title" className="text-[1.375rem]">Account</h2>
        <p className="text-muted">Signed in as <b className="break-all text-ink">{session?.user.email}</b></p>
        <p className="field-hint">You stay signed in on this device until you sign out. To sign back in, we email you a new link.</p>
        <Button variant="secondary" className="self-start" onClick={() => supabase.auth.signOut()}>
          <LogOut /> Sign out
        </Button>
      </section>
    </>
  );
}
