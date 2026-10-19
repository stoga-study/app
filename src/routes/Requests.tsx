import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { boardView, STATUS_LABEL, useBoard, useSuggest, useVote, type FeatureRequest } from "@/lib/queries/requests";

const VIEWS = [["top", "Most wanted"], ["new", "New"], ["done", "Planned and shipped"]] as const;

/** /requests: what students want next. Suggestions appear once the team has checked them; no names are shown. */
export default function Requests() {
  const board = useBoard();
  const [view, setView] = useState<(typeof VIEWS)[number][0]>("top");
  if (board.isPending) return <PageSkeleton />;
  const all = board.data ?? [];
  const waiting = all.filter((r) => r.mine && r.status === "review");
  const shown = boardView(all, view);
  return (
    <>
      <PageHeader title="Ideas board">What should Stoga.study do next? Vote for what you want, or suggest something new.</PageHeader>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section aria-label="Requests">
          <div role="tablist" aria-label="Sort" className="mb-3 flex gap-5 border-b border-line">
            {VIEWS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={cn("-mb-px border-b-2 py-2 text-[0.9375rem]", view === k ? "border-primary font-semibold text-ink" : "border-transparent text-muted hover:text-ink")}>{label}</button>
            ))}
          </div>
          {shown.length ? (
            <ul className="card divide-y divide-line">
              {shown.map((r) => <RequestRow key={r.id} r={r} />)}
            </ul>
          ) : (
            <p className="card p-5 text-muted">{view === "done" ? "Nothing planned or shipped from the board yet." : "No requests yet. Be the first to suggest something."}</p>
          )}
        </section>
        <aside className="flex flex-col gap-4">
          <SuggestForm />
          {waiting.length > 0 && (
            <section className="card p-5" aria-labelledby="waiting-h">
              <h2 id="waiting-h" className="text-[1.125rem]">Your suggestions</h2>
              <ul className="mt-2 flex flex-col gap-2">
                {waiting.map((r) => <li key={r.id} className="text-[0.9375rem]"><b className="font-semibold">{r.title}</b><span className="block text-[0.8125rem] text-muted">Waiting for review</span></li>)}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

function RequestRow({ r }: { r: FeatureRequest }) {
  const vote = useVote();
  const canVote = r.status === "open" || r.status === "planned" || r.status === "building";
  return (
    <li className="flex items-start gap-4 px-4 py-4">
      <button
        type="button"
        aria-pressed={r.voted}
        aria-label={`${r.voted ? "Take back your vote for" : "Vote for"} ${r.title}`}
        disabled={!canVote || vote.isPending}
        onClick={() => vote.mutate({ id: r.id, on: !r.voted }, { onError: () => toast.error("Couldn't save your vote. Try again.") })}
        className={cn("flex w-14 flex-none flex-col items-center rounded-[0.75rem] border py-1.5", r.voted ? "border-primary bg-tint text-brand" : "border-line-strong bg-card text-ink-2 hover:bg-soft", !canVote && "opacity-60")}
      >
        <span aria-hidden="true" className="text-[0.75rem]">▲</span>
        <span className="font-display text-[1.25rem] leading-none tabular-nums">{r.votes}</span>
      </button>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{r.title}</p>
        {r.body && <p className="mt-0.5 text-[0.9375rem] text-ink-2">{r.body}</p>}
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted">
          {r.status !== "open" && <span className={cn("chip !min-h-5 !px-2 !text-[0.75rem]", r.status === "shipped" ? "" : "chip-neutral")}>{STATUS_LABEL[r.status]}</span>}
          {r.note && <span>{r.note}</span>}
        </p>
      </div>
    </li>
  );
}

function SuggestForm() {
  const suggest = useSuggest();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    if (title.trim().length < 3) return;
    suggest.mutate({ title, body }, {
      onSuccess: () => { setTitle(""); setBody(""); toast.success("Thanks. It'll show on the board once it's been checked, usually within a day"); },
      onError: (err) => toast.error(/request_limit/.test(String((err as Error).message)) ? "That's 3 suggestions today. You can add more tomorrow." : "Couldn't send that. Try again."),
    });
  }
  return (
    <form onSubmit={submit} className="card flex flex-col gap-3 p-5" aria-labelledby="suggest-h">
      <h2 id="suggest-h" className="text-[1.125rem]">Suggest something</h2>
      <label className="flex flex-col gap-1">
        <span className="field-label">Your idea, in a few words</span>
        <input className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. A week view in the calendar" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="field-label">Details (optional)</span>
        <textarea className="input !min-h-24" value={body} maxLength={600} onChange={(e) => setBody(e.target.value)} />
      </label>
      <Button type="submit" className="self-start" disabled={title.trim().length < 3 || suggest.isPending}>{suggest.isPending ? "Sending…" : "Suggest"}</Button>
      <p className="field-hint">Suggestions show up once the team has checked them. No names are shown on the board.</p>
    </form>
  );
}
