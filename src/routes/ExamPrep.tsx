import { ArrowLeft, FileText, HeartHandshake, Pencil, Printer, Timer } from "lucide-react";
import { Link, useParams } from "react-router";
import { MathText } from "@/components/MathText";
import { PageHeader } from "@/components/PageHeader";
import { PlanTaskRow } from "@/components/PlanTaskRow";
import { ReadinessBadge } from "@/components/ReadinessBadge";
import { ErrorState, PageSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { daysBetween, shortDate, timeText, today, whenText } from "@/lib/calendar";
import { cardWeakness } from "@/lib/practiceTest";
import { useEvents, type CalEvent } from "@/lib/queries/events";
import { usePlan, useReadiness } from "@/lib/queries/plan";
import { useKeyTerms, usePracticePool, usePracticeTests } from "@/lib/queries/practiceTest";
import { useSubjects } from "@/lib/queries/profile";
import { useAllUnits } from "@/lib/queries/units";
import { unitName } from "@/lib/units";

function useExam() {
  const { id } = useParams();
  const events = useEvents();
  const subjects = useSubjects();
  const units = useAllUnits();
  const e = events.data?.find((x) => x.id === id);
  const subject = subjects.data?.find((s) => s.id === e?.subject_id);
  const unitNames = (e?.unit_ids ?? []).map((u) => units.data?.find((x) => x.id === u)).filter((u) => !!u).map((u) => unitName(u!));
  return { events, e, subject, unitNames };
}

const testLink = (e: CalEvent) => `/practice-test?event=${e.id}&subject=${e.subject_id}${e.unit_ids.length ? `&units=${e.unit_ids.join(",")}` : ""}`;

/** One test's workspace (/exam/:id): countdown, readiness by unit, its plan, practice tests and the review pack. */
export default function ExamPrep() {
  const { events, e, subject, unitNames } = useExam();
  const readinessOf = useReadiness();
  const plan = usePlan();
  const tests = usePracticeTests(e?.subject_id ?? undefined);
  if (events.isPending) return <PageSkeleton label="Opening your test." />;
  if (!e) return <ErrorState title="This test is not on your calendar anymore"><Link to="/calendar">Go to your calendar</Link>.</ErrorState>;

  const now = today();
  const left = daysBetween(now, e.due_on);
  const r = readinessOf(e);
  const mine = (tests.data ?? []).filter((t) => t.event_id === e.id);
  const days = plan.ready ? plan.days.map((d) => ({ ...d, tasks: d.tasks.filter((t) => t.examId === e.id) })).filter((d) => d.tasks.length) : [];

  return (
    <>
      <Link to="/calendar" className="mb-4 inline-flex min-h-11 items-center gap-2 font-bold text-ink-2 no-underline">
        <ArrowLeft className="size-5" /> Calendar
      </Link>
      <section className="ink-panel burgundy p-6" aria-labelledby="exam-title">
        <span className="circle circle-big right-[-4rem] top-[-5rem] size-52" aria-hidden="true" />
        <p className="text-[0.9375rem] text-[#F7EAEC]">{[subject?.name, unitNames.join(", ")].filter(Boolean).join(" · ") || "Test"}</p>
        <h1 id="exam-title" className="mt-1 text-[2rem]">{e.title}</h1>
        <p className="big-num mt-3 text-[4rem]">
          {left > 0 ? left : left === 0 ? "Today" : "Done"}
          {left > 0 && <span className="ml-2 font-body text-[1.125rem] tracking-normal">{left === 1 ? "day to go" : "days to go"}</span>}
        </p>
        <p className="text-[#F7EAEC]">{shortDate(e.due_on)}{e.due_time ? ` · ${timeText(e.due_time)}` : ""}</p>
        {r?.overall && left >= 0 && (
          <div className="mt-4 flex flex-col gap-2">
            <ReadinessBadge r={r.overall} onDark />
            {r.units.length > 0 && (
              <ul className="flex flex-col gap-1.5 border-t border-white/15 pt-3" aria-label="By unit">
                {r.units.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center gap-2 text-[0.9375rem]"><b className="min-w-[5rem]">{u.name}</b>{u.r ? <ReadinessBadge r={u.r} onDark /> : <span className="text-[#F7EAEC]">Nothing to study yet</span>}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        {e.subject_id && <Button asChild><Link to={testLink(e)}><Timer /> Take a practice test</Link></Button>}
        {e.subject_id && <Button asChild variant="secondary"><Link to={`/exam/${e.id}/pack`}><FileText /> Review pack</Link></Button>}
        <Button asChild variant="secondary"><Link to={`/coach?say=${encodeURIComponent(`Help me get ready for my ${e.title}`)}`}><HeartHandshake /> Ask the coach</Link></Button>
        <Button asChild variant="ghost"><Link to={`/calendar?event=${e.id}`}><Pencil /> Edit</Link></Button>
      </div>

      {!e.subject_id && <p className="callout neutral mt-4"><span>Pick the class this is for, and the units it covers, to get readiness, a plan and practice tests.</span></p>}

      {days.length > 0 && (
        <section className="mt-6" aria-labelledby="exam-plan">
          <h2 id="exam-plan" className="mb-3 text-[1.375rem]">Your plan for it</h2>
          <div className="flex flex-col gap-3">
            {days.map((d) => (
              <div key={d.day} className="card p-5">
                <h3 className="text-[1.125rem]">{whenText(d.day)}<span className="ml-2 font-body text-[0.9375rem] font-normal text-muted">{shortDate(d.day)}</span></h3>
                <ul className="divide-y divide-line">{d.tasks.map((t) => <PlanTaskRow key={t.key} t={t} today={d.day === now} />)}</ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6" aria-labelledby="exam-tests">
        <h2 id="exam-tests" className="mb-3 text-[1.375rem]">Practice tests</h2>
        {mine.length ? (
          <ul className="card divide-y divide-line px-5">
            {mine.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1">{new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(t.finished_at))} · {t.total} questions</span>
                <b className="tabular">{t.pct}%</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">None yet. One a few days before, and one the day before, shows you what to fix while there's time.</p>
        )}
      </section>
      {e.notes && (
        <section className="mt-6" aria-labelledby="exam-notes">
          <h2 id="exam-notes" className="mb-2 text-[1.375rem]">Notes</h2>
          <p className="whitespace-pre-line text-ink-2">{e.notes}</p>
        </section>
      )}
    </>
  );
}

/** A one-page cram sheet (/exam/:id/pack): key terms, open mistakes and 20 must-know cards. Printable. */
export function ReviewPack() {
  const { events, e, subject, unitNames } = useExam();
  const pool = usePracticePool(e?.subject_id ?? null, e?.unit_ids ?? []);
  const terms = useKeyTerms(e?.subject_id ?? null, e?.unit_ids ?? []);
  if (events.isPending || (e?.subject_id && (pool.isPending || terms.isPending))) return <PageSkeleton label="Putting your review pack together." />;
  if (!e || !e.subject_id) return <ErrorState title="No review pack for this one"><Link to="/calendar">Go to your calendar</Link>.</ErrorState>;

  const mistakes = (pool.data?.questions ?? []).filter((q) => q.missed).slice(0, 10);
  const cards = [...(pool.data?.cards ?? [])].sort((a, b) => cardWeakness(b) - cardWeakness(a)).slice(0, 20);
  const keyTerms = (terms.data ?? []).slice(0, 24);
  const empty = !mistakes.length && !cards.length && !keyTerms.length;

  return (
    <article className="mx-auto max-w-3xl print:max-w-none print:text-[11pt]" aria-labelledby="pack-title">
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link to={`/exam/${e.id}`} className="inline-flex min-h-11 flex-1 items-center gap-2 font-bold text-ink-2 no-underline"><ArrowLeft className="size-5" /> {e.title}</Link>
        {!empty && <Button onClick={() => window.print()}><Printer /> Print or save as PDF</Button>}
      </div>
      <PageHeader eyebrow={[subject?.name, unitNames.join(", "), shortDate(e.due_on)].filter(Boolean).join(" · ")} title={`Review pack: ${e.title}`} />
      {empty && <p className="callout neutral"><span>Nothing to put in a pack yet. Make flashcards, key terms or a quiz from a file in {e.unit_ids.length ? "these units" : "this class"}, and they'll show up here.</span></p>}

      {keyTerms.length > 0 && (
        <section className="mb-6 break-inside-avoid" aria-labelledby="pack-terms">
          <h2 id="pack-terms" className="mb-2 text-[1.375rem]">Key terms</h2>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 print:grid-cols-2">
            {keyTerms.map((t) => (
              <div key={t.id} className="break-inside-avoid">
                <dt className="font-bold"><MathText text={t.term} /></dt>
                <dd className="text-[0.9375rem] text-ink-2"><MathText text={t.definition} /></dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {mistakes.length > 0 && (
        <section className="mb-6" aria-labelledby="pack-mistakes">
          <h2 id="pack-mistakes" className="mb-2 text-[1.375rem]">Questions you missed</h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            {mistakes.map((q) => (
              <li key={q.id} className="break-inside-avoid">
                <MathText text={q.prompt} />
                <p className="text-[0.9375rem]"><b>Answer: </b><MathText text={q.options[q.answer_index] ?? ""} /></p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {cards.length > 0 && (
        <section aria-labelledby="pack-cards">
          <h2 id="pack-cards" className="mb-2 text-[1.375rem]">{cards.length} must-know cards</h2>
          <p className="mb-2 text-[0.875rem] text-muted print:hidden">The ones that have been hardest for you, first.</p>
          <table className="w-full border-collapse text-left text-[0.9375rem]">
            <tbody>
              {cards.map((c) => (
                <tr key={c.id} className="break-inside-avoid border-t border-line align-top">
                  <th scope="row" className="w-1/2 py-2 pr-4 font-bold"><MathText text={c.front} /></th>
                  <td className="py-2"><MathText text={c.back} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </article>
  );
}
