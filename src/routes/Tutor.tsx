import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUp, BookOpen, FileText, Layers, ListChecks, MessageCircle, NotebookPen, Plus, Trash2, WifiOff } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Markdown } from "@/components/Markdown";
import { PageHeader } from "@/components/PageHeader";
import { ReportButton } from "@/components/ReportButton";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { useSubjects } from "@/lib/queries/profile";
import { useAllowance } from "@/lib/queries/sources";
import { askTutor, citesNotes, displayText, HINT_LABEL, makeCardFromAnswer, modeOf, useThreadMessages, useThreads, useThreadScope, type ChatScope, type Citation, type ExplainContext, type SourceRef, type TutorMessage, type TutorMode } from "@/lib/tutor";
import { unitName } from "@/lib/units";
import { useOnline } from "@/lib/useOnline";
import { useDeleteThread } from "@/lib/queries/privacy";
import { dateFormat } from "@/lib/locale";

const fmtWhen = (iso: string) => dateFormat({ month: "short", day: "numeric" }).format(new Date(iso));

/** /tutor: choose a class, or pick up a recent conversation. */
export function TutorHome() {
  const subjects = useSubjects();
  const threads = useThreads();
  if (subjects.isPending) return <PageSkeleton />;
  const name = (id: string) => subjects.data?.find((s) => s.id === id)?.name ?? "";
  return (
    <>
      <PageHeader title="AI tutor">Ask about anything in your notes. Hints come first; the full explanation is there when you want it.</PageHeader>
      {!subjects.data?.length ? (
        <EmptyState icon={<MessageCircle />} title="Add a class first" action={<Button asChild><Link to="/classes">Choose your classes</Link></Button>}>The tutor answers from the notes you add to a class.</EmptyState>
      ) : (
        <>
          <h2 className="mb-3 text-[1.375rem]">Which class?</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {subjects.data.map((s) => (
              <li key={s.id}>
                <Link to={`/tutor/${s.id}`} className="card flex items-center gap-4 p-4 text-ink no-underline">
                  <span className="tile soft"><BookOpen /></span>
                  <span className="font-display text-[1.125rem] font-bold">{s.name}</span>
                </Link>
              </li>
            ))}
          </ul>
          {!!threads.data?.length && (
            <section className="mt-8" aria-labelledby="recent">
              <h2 id="recent" className="mb-3 text-[1.375rem]">Recent conversations</h2>
              <ul className="card divide-y divide-line px-4">
                {threads.data.map((t) => <ThreadRow key={t.id} t={t} className={name(t.subject_id)} />)}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}

/** A recent conversation, with a way to delete it. */
function ThreadRow({ t, className }: { t: { id: string; subject_id: string; title: string | null; updated_at: string }; className: string }) {
  const del = useDeleteThread();
  const [confirm, setConfirm] = useState(false);
  if (confirm)
    return (
      <li role="alert" className="flex flex-wrap items-center gap-2 py-3">
        <span className="min-w-0 flex-1">Delete “{t.title || "Conversation"}” for good?</span>
        <Button size="sm" disabled={del.isPending} onClick={() => del.mutate(t.id, { onSuccess: () => toast.success("Conversation deleted"), onError: () => toast.error("Couldn't delete it. Try again.") })}>Delete</Button>
        <Button size="sm" variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button>
      </li>
    );
  return (
    <li className="flex items-center gap-2">
      <Link to={`/tutor/${t.subject_id}?thread=${t.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-3 text-ink no-underline">
        <MessageCircle className="size-5 flex-none text-brand" aria-hidden="true" />
        <span className="min-w-0 flex-1"><span className="block truncate font-bold">{t.title}</span><span className="block text-[0.8125rem] text-muted">{className} · {fmtWhen(t.updated_at)}</span></span>
      </Link>
      <Button size="sm" variant="ghost" aria-label={`Delete conversation: ${t.title || "Conversation"}`} onClick={() => setConfirm(true)}><Trash2 /></Button>
    </li>
  );
}

function CiteChip({ c }: { c: Pick<Citation, "source_id" | "page" | "kind" | "filename"> }) {
  if (c.kind === "note")
    return (
      <Link to={`/notes/${c.source_id}`} className="source-chip mx-0.5 !min-h-7 align-middle !text-[0.75rem]" title={c.filename}>
        <NotebookPen aria-hidden="true" /> My notes
      </Link>
    );
  const paged = c.kind === "pdf" || c.kind === "image";
  return (
    <Link to={paged ? `/sources/${c.source_id}/view?page=${c.page}` : `/sources/${c.source_id}`} className="source-chip mx-0.5 !min-h-7 align-middle !text-[0.75rem]" title={c.filename}>
      <FileText aria-hidden="true" />
      {paged ? "p." : c.kind === "pptx" ? "slide" : "part"} {c.page}
    </Link>
  );
}

function labelFor(mode: TutorMode, level: number | null, fromNotes: boolean) {
  if (mode === "chat") return null;
  if (mode === "explain") return fromNotes ? "From your notes" : "General knowledge";
  const step = mode === "check" ? "Checking your answer" : HINT_LABEL[level ?? 1];
  return fromNotes ? step : `${step}, general knowledge`;
}

function Answer({ m, subjectId, live }: { m: { id?: string; content: string; hint_level: number | null; mode: TutorMode | null; citations: Citation[] }; subjectId: string; live?: SourceRef[] }) {
  const lookup = (key: string, page: number) => {
    const c = m.citations.find((x) => x.key === key && x.page === page);
    if (c) return c;
    const s = live?.find((x) => x.key === key);
    return s && s.pages.includes(page) ? { source_id: s.source_id, page, kind: s.kind, filename: s.filename } : null;
  };
  const mode = modeOf(m);
  const full = mode === "hint" && m.hint_level === 3;
  const label = labelFor(mode, m.hint_level, citesNotes(m.content));
  return (
    <div className={`max-w-[94%] rounded-[1.25rem] rounded-bl-md p-4 ${full ? "bg-ink-panel text-white" : "bg-tint"}`}>
      {label && <p className={`text-[0.8125rem] font-bold ${full ? "text-[#F2A8BA]" : "text-brand"}`}>{label}</p>}
      <Markdown text={displayText(m.content)} className="text-[0.9875rem] leading-relaxed" cite={(key, page, i) => { const c = lookup(key, page); return c ? <CiteChip key={i} c={c} /> : null; }} />
      {m.id && <ReportButton itemType="tutor_message" itemId={m.id} subjectId={subjectId} className={`mt-1 -ml-3 ${full ? "!text-white/80" : ""}`} />}
    </div>
  );
}

/** /tutor/:subjectId: one conversation. */
export default function Tutor() {
  const { subjectId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const online = useOnline();
  const subjects = useSubjects();
  const allowance = useAllowance();
  // The open conversation lives in the URL (?thread=), so links and the back button just work.
  const threadId = params.get("thread");
  const history = useThreadMessages(threadId);
  // ?source= or ?unit= on a fresh conversation (not yet a thread) narrows what it's scoped to.
  const scopeSource = !threadId ? params.get("source") : null;
  const scopeUnit = !threadId ? params.get("unit") : null;
  const threadScope = useThreadScope(threadId);
  const [draft, setDraft] = useState("");
  const [live, setLive] = useState<{ question: string; level: 1 | 2 | 3; mode: TutorMode | null; text: string; sources: SourceRef[] } | null>(null);
  const [limit, setLimit] = useState<{ resets_at?: string; used?: number; limit?: number } | null>(null);
  const [carded, setCarded] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [history.data?.length, live?.text]);

  const subject = subjects.data?.find((s) => s.id === subjectId);

  // "Explain this" (from a card back or a missed quiz question) arrives as ?explain=card:<id> or
  // ?explain=quiz_question:<id> on a fresh conversation; fire it once, then drop the param.
  const explainFired = useRef(false);
  useEffect(() => {
    const spec = params.get("explain");
    if (!spec || explainFired.current || threadId || live || !subject) return;
    const [kind, id] = spec.split(":");
    if ((kind !== "card" && kind !== "quiz_question") || !id) return;
    explainFired.current = true;
    setParams((p) => { const n = new URLSearchParams(p); n.delete("explain"); return n; }, { replace: true });
    void ask({ question: kind === "card" ? "Explain this flashcard" : "Explain this question", context: { kind, id } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, threadId, live, subject]);

  if (subjects.isPending) return <PageSkeleton />;
  if (!subject) return <ErrorState title="We could not find that class"><Link to="/tutor">Pick a class</Link>.</ErrorState>;

  const msgs: TutorMessage[] = history.data ?? [];
  const lastUser = [...msgs].reverse().find((m) => m.role === "user");
  const lastAnswer = [...msgs].reverse().find((m) => m.role === "assistant");
  const tutorUse = allowance.data?.tutor_message;

  async function ask(opts: { question: string; level?: 1 | 2 | 3; followup?: boolean; context?: ExplainContext; depthOverride?: "simpler" | "deeper"; workedExample?: boolean; retryMode?: TutorMode }) {
    const { question, level = 1, followup = false, context, depthOverride, workedExample, retryMode } = opts;
    if (live) return;
    setLive({ question: followup || depthOverride || workedExample ? "" : question, level, mode: null, text: "", sources: [] });
    let thread = threadId;
    // Only matters the moment a thread is born; an existing thread already has its own scope.
    const scope: ChatScope | undefined = thread ? undefined : scopeSource ? { source_id: scopeSource } : scopeUnit ? { unit_id: scopeUnit } : undefined;
    const body = context
      ? { subject_id: subject!.id, context, thread_id: thread }
      : {
          subject_id: subject!.id, question, hint_level: level, thread_id: thread, followup, scope,
          ...(depthOverride ? { depth_override: depthOverride, retry_mode: retryMode } : {}),
          ...(workedExample ? { worked_example: true, retry_mode: retryMode } : {}),
        };
    await askTutor(body, (e) => {
      if (e.type === "meta") {
        thread = e.thread_id;
        setLive((l) => (l ? { ...l, sources: e.sources } : l));
      } else if (e.type === "mode") setLive((l) => (l ? { ...l, mode: e.mode } : l));
      else if (e.type === "delta") setLive((l) => (l ? { ...l, text: l.text + e.text } : l));
      else if (e.type === "error") {
        if (e.error === "limit") setLimit({ resets_at: e.resets_at, used: e.used, limit: e.limit });
        else toast(e.error === "busy" ? "Stoga.study is busy right now. Try again in a minute. That did not count." : e.error === "offline" ? "You are offline. The tutor needs a connection." : e.error === "key_invalid" ? "Your own key did not work. Update it in Settings." : "The answer was cut off. Try again; that did not count.");
      }
    });
    if (thread && thread !== threadId) setParams({ thread }, { replace: true });
    await qc.invalidateQueries({ queryKey: ["thread", thread] });
    qc.invalidateQueries({ queryKey: ["threads"] });
    qc.invalidateQueries({ queryKey: ["allowance"] });
    setLive(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = draft.trim();
    if (!q || live) return;
    setDraft("");
    void ask({ question: q });
  }

  if (limit) {
    const resets = limit.resets_at ? new Date(limit.resets_at) : null;
    const mins = resets ? Math.max(1, Math.round((resets.getTime() - new Date().getTime()) / 60000)) : null;
    return (
      <section className="mx-auto flex max-w-xl flex-col gap-4">
        <button type="button" onClick={() => setLimit(null)} className="grid size-11 place-items-center rounded-full" aria-label="Back"><ArrowLeft className="size-5" /></button>
        <div className="ink-panel p-6">
          <span className="circle circle-big right-[-4rem] top-[-5rem] size-52" aria-hidden="true" />
          <p className="ink-muted text-[0.9375rem]">Tutor messages today</p>
          <p className="big-num mt-1 text-[4rem] tabular">{limit.used ?? 50} of {limit.limit ?? 50}</p>
          <p className="ink-muted mt-2">Fresh messages arrive at midnight{mins ? `, in ${Math.floor(mins / 60)}h ${mins % 60}m` : ""}. Your cards, notes and quizzes still work.</p>
        </div>
        <p className="font-bold">While you wait</p>
        <Button asChild variant="secondary"><Link to="/review/session"><Layers /> Review your cards</Link></Button>
        <Button asChild variant="secondary"><Link to="/review"><ListChecks /> Take a practice quiz</Link></Button>
        <Link to="/plans" className="text-[0.9375rem]">Use your own key for more</Link>
      </section>
    );
  }

  return (
    <section className="mx-auto flex min-h-[calc(100dvh-10rem)] max-w-2xl flex-col" aria-label={`AI tutor for ${subject.name}`}>
      <div className="mb-4 flex items-center gap-2">
        <button type="button" onClick={() => navigate("/tutor")} className="grid size-11 place-items-center rounded-full" aria-label="Back to tutor"><ArrowLeft className="size-5" /></button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[1.375rem]">AI tutor</h1>
          <p className="truncate text-[0.875rem] text-muted">
            {threadScope.data?.source_filename
              ? `${subject.name} · ${threadScope.data.source_filename}`
              : threadScope.data?.unit_id
                ? `${subject.name} · ${unitName({ number: threadScope.data.unit_number, title: threadScope.data.unit_title })}`
                : `${subject.name}, using your notes`}
          </p>
        </div>
        <span className="chip">Learn, not copy</span>
        {threadId && <Button variant="ghost" size="sm" aria-label="New question" onClick={() => setParams({}, { replace: true })}><Plus /></Button>}
      </div>

      <div className="flex flex-1 flex-col gap-3" aria-live="polite">
        {!threadId && !live && (
          <div className="card card-dashed p-5">
            <p className="font-display text-[1.25rem] font-bold">What are you stuck on?</p>
            <p className="mt-1 text-muted">Ask about an idea and get a straight answer from your {subject.name} notes, with page links. Stuck on a problem? You get a hint first, then a closer hint, then the full explanation if you want it.</p>
          </div>
        )}
        {history.isPending && threadId && <div className="skeleton h-24 rounded-[1.25rem]" />}
        {msgs.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="max-w-[88%] self-end rounded-[1.25rem] rounded-br-md border-2 border-line bg-card p-3">{m.content}</div>
          ) : (
            <Answer key={m.id} m={m} subjectId={subject.id} />
          ),
        )}
        {live && (
          <>
            {live.question && <div className="max-w-[88%] self-end rounded-[1.25rem] rounded-br-md border-2 border-line bg-card p-3">{live.question}</div>}
            {live.text && live.mode ? <Answer m={{ content: live.text, hint_level: live.level, mode: live.mode, citations: [] }} subjectId={subject.id} live={live.sources} /> : <div className="skeleton h-16 w-2/3 rounded-[1.25rem]" aria-label="The tutor is writing" />}
          </>
        )}
        {!live && lastAnswer && lastUser && modeOf(lastAnswer) !== "chat" && (
          <div className="flex flex-wrap gap-2">
            {(modeOf(lastAnswer) === "hint" || modeOf(lastAnswer) === "check") && (lastAnswer.hint_level ?? 1) < 3 && (
              <Button size="sm" onClick={() => ask({ question: lastUser.content, level: (modeOf(lastAnswer) === "check" ? 3 : (lastAnswer.hint_level ?? 1) + 1) as 2 | 3, followup: true })} disabled={!online}>
                {modeOf(lastAnswer) === "hint" && (lastAnswer.hint_level ?? 1) === 1 ? "Show hint 2" : "Show full explanation"}
              </Button>
            )}
            {modeOf(lastAnswer) === "hint" && (lastAnswer.hint_level ?? 1) < 3 && <Button size="sm" variant="secondary" onClick={() => inputRef.current?.focus()}>Let me try</Button>}
            {modeOf(lastAnswer) === "hint" && (
              <Button size="sm" variant="secondary" onClick={() => ask({ question: lastUser.content, followup: true, workedExample: true, retryMode: "hint" })} disabled={!online}>Show a worked example</Button>
            )}
            {(modeOf(lastAnswer) === "explain" || modeOf(lastAnswer) === "check" || (modeOf(lastAnswer) === "hint" && (lastAnswer.hint_level ?? 1) >= 3)) && (
              <>
                <Button size="sm" variant="secondary" onClick={() => ask({ question: lastUser.content, followup: true, depthOverride: "simpler", retryMode: modeOf(lastAnswer) })} disabled={!online}>Simpler</Button>
                <Button size="sm" variant="secondary" onClick={() => ask({ question: lastUser.content, followup: true, depthOverride: "deeper", retryMode: modeOf(lastAnswer) })} disabled={!online}>Go deeper</Button>
              </>
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={carded[lastAnswer.id] || !online}
              onClick={() =>
                makeCardFromAnswer(lastAnswer.id)
                  .then(() => { setCarded((c) => ({ ...c, [lastAnswer.id]: true })); toast(`Card added to ${subject.name}. You can edit it in review.`); qc.invalidateQueries({ queryKey: ["due-cards"] }); })
                  .catch(() => toast("We could not make that card. Try again in a moment."))
              }
            >
              {carded[lastAnswer.id] ? "Card added" : "Make a flashcard"}
            </Button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] mt-4 border-t border-line bg-bg pt-3 lg:bottom-0 lg:pb-4">
        <p className="mb-2 text-center text-[0.8125rem] text-muted">
          {online ? "Check key facts against your sources." : <span className="inline-flex items-center gap-1"><WifiOff className="size-4" /> The tutor needs a connection.</span>}
          {tutorUse?.limit != null && <span className="tabular"> {tutorUse.used} of {tutorUse.limit} today.</span>}
        </p>
        <form onSubmit={onSubmit} className="flex items-end gap-2 rounded-[1.5rem] border-2 border-line bg-card p-2 focus-within:border-hot">
          <label htmlFor="ask" className="sr-only">Ask about your notes</label>
          <textarea
            id="ask"
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(e); } }}
            placeholder={lastAnswer ? "Your answer, or a new question" : "Ask about your notes"}
            className="max-h-40 min-h-11 flex-1 resize-none border-0 bg-transparent px-3 py-2.5 outline-none"
          />
          <button type="submit" disabled={!draft.trim() || !!live || !online} aria-label="Send" className="grid size-11 flex-none place-items-center rounded-full bg-primary text-white disabled:bg-line disabled:text-muted">
            <ArrowUp className="size-5" />
          </button>
        </form>
      </div>
    </section>
  );
}
