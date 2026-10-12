import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Camera, Check, Gift, Layers, ListChecks, Sparkles, Wand2 } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Brand } from "@/components/Brand";
import { PageHeader } from "@/components/PageHeader";
import { PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/session";
import { unseen, useChangelog, type Release } from "@/lib/changelog";
import { useProfile } from "@/lib/queries/profile";
import { supabase } from "@/lib/supabase";

const ICONS: Record<string, ReactNode> = {
  choose: <Wand2 />, amount: <ListChecks />, more: <Layers />, free: <Gift />, photo: <Camera />,
};
const fmtDate = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(`${iso}T12:00:00`));

function ReleaseBody({ r, big }: { r: Release; big?: boolean }) {
  return (
    <>
      <ul className={big ? "grid gap-3 sm:grid-cols-2" : "flex flex-col gap-3"}>
        {r.highlights.map((h) => (
          <li key={h.title} className="card flex items-start gap-4 p-5">
            <span className="tile soft flex-none">{ICONS[h.icon] ?? <Sparkles />}</span>
            <span>
              <span className="block font-display text-[1.125rem] font-bold">{h.title}</span>
              <span className="mt-1 block text-ink-2">{h.text}</span>
            </span>
          </li>
        ))}
      </ul>
      {!!r.fixes?.length && (
        <div className="mt-4">
          <p className="font-bold">Also fixed</p>
          <ul className="mt-2 flex flex-col gap-2">
            {r.fixes.map((f) => (
              <li key={f} className="flex items-start gap-2 text-[0.9375rem] text-ink-2"><Check className="mt-0.5 size-4 flex-none text-brand" aria-hidden="true" />{f}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/** Marks every release up to `version` as seen for this student, on every device. */
export function useMarkSeen() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return async (version: string) => {
    if (!session) return;
    await supabase.from("profiles").update({ last_seen_version: version }).eq("user_id", session.user.id);
    await qc.invalidateQueries({ queryKey: ["profile"] });
  };
}

/** /whats-new: the big, full-screen changelog shown once after an update. */
export default function WhatsNew() {
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/";
  const profile = useProfile();
  const log = useChangelog();
  const markSeen = useMarkSeen();
  if (log.isPending || profile.isPending) return <div className="mx-auto max-w-xl p-6"><PageSkeleton /></div>;
  const releases = log.data ? unseen(log.data, profile.data?.last_seen_version) : [];
  const shown = releases.length ? releases : log.data?.slice(0, 1) ?? [];
  const latest = log.data?.[0];

  async function done() {
    if (latest) await markSeen(latest.version);
    navigate(from === "/whats-new" ? "/" : from, { replace: true });
  }

  return (
    <div className="min-h-dvh bg-bg px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] md:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <Brand descriptor={false} />
        {shown.map((r, i) => (
          <section key={r.version} aria-labelledby={`rel-${r.version}`} className="flex flex-col gap-4">
            <div className={i === 0 ? "ink-panel p-7 md:p-9" : "pt-2"}>
              {i === 0 && <span className="circle circle-big right-[-5rem] top-[-6rem] size-64" aria-hidden="true" />}
              {i === 0 && <span className="circle circle-hot right-10 top-10 size-10" aria-hidden="true" />}
              <p className={i === 0 ? "ink-muted text-[0.9375rem] font-bold" : "text-[0.9375rem] font-bold text-muted"}>
                What&apos;s new · v{r.version} · {fmtDate(r.date)}
              </p>
              <h1 id={`rel-${r.version}`} className={i === 0 ? "mt-2 max-w-[34rem] text-[2.5rem] leading-[1.05] md:text-[3.25rem]" : "mt-1 text-[1.75rem]"}>{r.title}</h1>
              {r.intro && <p className={i === 0 ? "ink-muted mt-3 max-w-[34rem] text-[1.0625rem]" : "mt-2 text-muted"}>{r.intro}</p>}
            </div>
            <ReleaseBody r={r} big={i === 0} />
          </section>
        ))}
        {/* A solid band, so the cards scroll underneath the buttons instead of showing through. */}
        <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-3 border-t border-line bg-bg px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:-mx-8 md:px-8">
          <Button onClick={done}>Continue <ArrowRight /></Button>
          <Link to="/changelog" onClick={() => latest && markSeen(latest.version)} className="font-bold">All updates</Link>
        </div>
      </div>
    </div>
  );
}

/** /changelog: every release, newest first. */
export function Changelog() {
  const log = useChangelog();
  return (
    <>
      <PageHeader title="What's new">Every update to Stoga.study, newest first.</PageHeader>
      {log.isPending ? <PageSkeleton /> : log.isError ? (
        <p className="callout">We could not load the updates. Check your connection, then try again.</p>
      ) : (
        <div className="flex flex-col gap-10">
          {log.data.map((r) => (
            <section key={r.version} aria-labelledby={`cl-${r.version}`}>
              <p className="text-[0.875rem] font-bold text-muted">v{r.version} · {fmtDate(r.date)}</p>
              <h2 id={`cl-${r.version}`} className="mt-1 text-[1.5rem]">{r.title}</h2>
              {r.intro && <p className="mb-3 mt-1 text-muted">{r.intro}</p>}
              <ReleaseBody r={r} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
