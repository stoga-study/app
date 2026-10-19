import { useState } from "react";
import { PublicFrame } from "@/components/PublicFrame";
import { Button } from "@/components/ui/button";
import { useChangelog } from "@/lib/changelog";
import { dateFormat } from "@/lib/locale";

const day = (iso: string) => dateFormat({ month: "long", day: "numeric", year: "numeric" }).format(new Date(`${iso}T12:00:00`));

/** /updates: every release in plain words, public (no sign-in). */
export default function PublicUpdates() {
  const log = useChangelog();
  const [all, setAll] = useState(false);
  const releases = log.data ?? [];
  const shown = all ? releases : releases.slice(0, 15);
  return (
    <PublicFrame>
      <p className="eyebrow">Updates</p>
      <h1 className="mt-2 text-[2.5rem] leading-[1.05]">What's new in Stoga.study</h1>
      <p className="mt-3 max-w-[60ch] text-ink-2">Every update, in plain words. Stoga.study is in a public beta, so things change often, usually because a student asked.</p>
      {log.isPending ? <div className="mt-8 flex flex-col gap-4"><div className="skeleton h-32" /><div className="skeleton h-32" /></div>
        : log.isError ? <p className="mt-8 text-muted">The updates couldn't load. Refresh to try again.</p>
        : (
          <ol className="mt-8 flex flex-col">
            {shown.map((r) => (
              <li key={r.version} className="grid gap-x-8 gap-y-2 border-t border-line py-6 md:grid-cols-[10rem_minmax(0,1fr)]">
                <div className="font-mono text-[0.8125rem] text-muted"><span className="block text-ink-2">Version {r.version}</span>{day(r.date)}</div>
                <div className="min-w-0">
                  <h2 className="text-[1.5rem] leading-tight">{r.title}</h2>
                  {r.intro && <p className="mt-1 text-ink-2">{r.intro}</p>}
                  <ul className="mt-3 flex flex-col gap-2">
                    {r.highlights.map((h) => (
                      <li key={h.title}><b className="font-semibold">{h.title}.</b> <span className="text-ink-2">{h.text}</span></li>
                    ))}
                  </ul>
                  {!!r.fixes?.length && <ul className="mt-3 list-disc pl-5 text-[0.9375rem] text-muted">{r.fixes.map((f) => <li key={f}>{f}</li>)}</ul>}
                </div>
              </li>
            ))}
          </ol>
        )}
      {!all && releases.length > shown.length && <Button variant="secondary" onClick={() => setAll(true)}>Show {releases.length - shown.length} older updates</Button>}
    </PublicFrame>
  );
}
