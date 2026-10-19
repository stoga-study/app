import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { PublicFrame } from "@/components/PublicFrame";
import { dateFormat } from "@/lib/locale";
import { supabase } from "@/lib/supabase";

type Issue = { id: string; title: string; body: string; workaround: string | null; status: "open" | "fixed"; fixed_in: string | null; created_at: string; fixed_at: string | null };
const day = (iso: string) => dateFormat({ month: "short", day: "numeric" }).format(new Date(iso));

/** /known-issues: what we know is broken, any workaround, and what was fixed lately. Public (no sign-in). */
export default function KnownIssues() {
  const issues = useQuery({
    queryKey: ["known-issues"],
    queryFn: async () => {
      const { data, error } = await supabase.from("known_issues").select("id, title, body, workaround, status, fixed_in, created_at, fixed_at").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      const monthAgo = Date.now() - 30 * 86400_000;
      const rows = data as Issue[];
      return { open: rows.filter((i) => i.status === "open"), fixed: rows.filter((i) => i.status === "fixed" && i.fixed_at && Date.parse(i.fixed_at) > monthAgo) };
    },
  });
  const open = issues.data?.open ?? [];
  const fixed = issues.data?.fixed ?? [];
  return (
    <PublicFrame>
      <p className="eyebrow">Known issues</p>
      <h1 className="mt-2 text-[2.5rem] leading-[1.05]">What we know isn't working yet</h1>
      <p className="mt-3 max-w-[60ch] text-ink-2">
        Stoga.study is in a public beta. These are the problems we know about and are working on. Found something that isn't here? Use the feedback button in the app, and it goes straight to the people building it.
      </p>
      {issues.isPending ? <div className="mt-8 skeleton h-32" /> : issues.isError ? <p className="mt-8 text-muted">This page couldn't load. Refresh to try again.</p> : (
        <>
          <section className="mt-8" aria-labelledby="open-h">
            <h2 id="open-h" className="text-[1.5rem]">Open</h2>
            {open.length ? (
              <ul className="mt-3 flex flex-col">
                {open.map((i) => (
                  <li key={i.id} className="border-t border-line py-4">
                    <p className="font-semibold">{i.title}</p>
                    {i.body && <p className="mt-1 text-ink-2">{i.body}</p>}
                    {i.workaround && <p className="mt-2 text-[0.9375rem]"><span className="font-medium">For now:</span> <span className="text-ink-2">{i.workaround}</span></p>}
                    <p className="mt-1 font-mono text-[0.75rem] text-muted">Known since {day(i.created_at)}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 border-t border-line pt-4 text-ink-2">Nothing known right now.</p>}
          </section>
          {fixed.length > 0 && (
            <section className="mt-10" aria-labelledby="fixed-h">
              <h2 id="fixed-h" className="text-[1.5rem]">Fixed lately</h2>
              <ul className="mt-3 flex flex-col">
                {fixed.map((i) => (
                  <li key={i.id} className="border-t border-line py-4">
                    <p className="font-semibold">{i.title}</p>
                    <p className="mt-1 font-mono text-[0.75rem] text-muted">Fixed {i.fixed_at ? day(i.fixed_at) : ""}{i.fixed_in ? ` in version ${i.fixed_in}` : ""}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="mt-10 text-[0.9375rem] text-muted"><Link to="/updates" className="underline">See every update</Link></p>
        </>
      )}
    </PublicFrame>
  );
}
