import { useParams } from "react-router";
import { Brand } from "@/components/Brand";
import { ReadinessBadge } from "@/components/ReadinessBadge";
import { dateFormat } from "@/lib/locale";
import { useSupportView, type SupportSummary } from "@/lib/queries/support";

const KIND: Record<string, string> = { test: "Test", quiz: "Quiz", homework: "Homework", project: "Project", other: "Other" };
const longDay = (iso: string) => dateFormat({ weekday: "short", month: "short", day: "numeric" }).format(new Date(`${iso}T12:00:00`));
const daysUntil = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400_000);

/** /support/:token: the read-only page a student shares with a parent, guardian, tutor or counselor. No account needed. */
export default function SupportView() {
  const { token } = useParams();
  const view = useSupportView(token);
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4 md:px-8">
          <Brand descriptor={false} />
          <span className="eyebrow">Read-only</span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 pt-8 pb-16 md:px-8 md:pt-12">
        {view.isPending ? (
          <div className="flex flex-col gap-4"><div className="skeleton h-12 w-2/3" /><div className="skeleton h-32" /><div className="skeleton h-48" /></div>
        ) : view.isError ? (
          <Message title="This page couldn't load">Check your connection and refresh the page.</Message>
        ) : !view.data ? (
          <Message title="This link doesn't work anymore">It may have been turned off or expired. Ask for a new link if you still need one.</Message>
        ) : (
          <Summary s={view.data.summary} label={view.data.label} expires={view.data.expires_at} />
        )}
      </main>
    </div>
  );
}

function Message({ title, children }: { title: string; children: string }) {
  return (
    <section className="card max-w-xl p-6">
      <h1 className="text-[1.75rem]">{title}</h1>
      <p className="mt-2 text-ink-2">{children}</p>
    </section>
  );
}

function Summary({ s, label, expires }: { s: SupportSummary; label: string; expires: string }) {
  const nextExam = s.upcoming.find((u) => (u.kind === "test" || u.kind === "quiz") && !u.done);
  const max = Math.max(1, ...s.days.map((d) => d.n));
  const studiedDays28 = s.days.filter((d) => d.n > 0).length;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow">A study update shared by {s.name}</p>
        <h1 className="mt-2 text-[2.25rem] leading-[1.05] md:text-[2.75rem]">How {s.name}'s studying is going</h1>
      </div>

      <section className="card grid gap-5 p-5 sm:grid-cols-3 md:p-6" aria-label="This week">
        <div>
          <p className="eyebrow">Days studied this week</p>
          <p className="big-num mt-1 text-[2.75rem]">{s.daysStudied7}<span className="ml-1 font-body text-[1rem] tracking-normal text-muted">of 7</span></p>
        </div>
        <div>
          <p className="eyebrow">Practice this week</p>
          <p className="big-num mt-1 text-[2.75rem]">{s.items7}</p>
          <p className="text-[0.8125rem] text-muted">flashcards, quiz questions and tutor questions</p>
        </div>
        <div>
          <p className="eyebrow">Next test</p>
          {nextExam ? (
            <>
              {(() => {
                const n = daysUntil(s.today, nextExam.due_on);
                return n <= 1
                  ? <p className="big-num mt-1 text-[2.75rem]">{n === 0 ? "Today" : "Tomorrow"}</p>
                  : <p className="big-num mt-1 text-[2.75rem]">{n}<span className="ml-1 font-body text-[1rem] tracking-normal text-muted">days</span></p>;
              })()}
              <p className="text-[0.8125rem] text-muted">{nextExam.title}</p>
            </>
          ) : <p className="mt-2 text-ink-2">Nothing on the calendar for the next three weeks.</p>}
        </div>
      </section>

      <section className="card p-5 md:p-6" aria-labelledby="activity-h">
        <h2 id="activity-h" className="text-[1.25rem]">The last four weeks</h2>
        <p className="mt-1 text-[0.875rem] text-muted">Studied on {studiedDays28} of the last 28 days. Darker means more practice that day.</p>
        <div className="mt-4 grid grid-cols-7 gap-1.5 sm:max-w-md" role="img" aria-label={`Studied on ${studiedDays28} of the last 28 days`}>
          {s.days.map((d) => (
            <span key={d.date} title={`${longDay(d.date)}: ${d.n} ${d.n === 1 ? "item" : "items"}`} className="aspect-square rounded-[0.3rem] border border-line"
              style={{ background: d.n ? `color-mix(in srgb, var(--primary) ${Math.round(20 + 80 * (d.n / max))}%, var(--card))` : "var(--soft)" }} />
          ))}
        </div>
      </section>

      <section className="card p-5 md:p-6" aria-labelledby="upcoming-h">
        <h2 id="upcoming-h" className="text-[1.25rem]">Coming up</h2>
        {s.upcoming.length ? (
          <ul className="mt-2 divide-y divide-line">
            {s.upcoming.map((u, i) => (
              <li key={i} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-3 py-3">
                <span className="font-mono text-[0.8125rem] text-muted">{longDay(u.due_on)}</span>
                <span className="min-w-0">
                  <b className={u.done ? "font-semibold text-muted line-through" : "font-semibold"}>{u.title}</b>
                  <span className="block text-[0.8125rem] text-muted">{KIND[u.kind] ?? u.kind}{u.className ? ` · ${u.className}` : ""}{u.done ? " · done" : ""}</span>
                  {u.readiness && !u.done && <span className="mt-1.5 block"><ReadinessBadge r={u.readiness} /></span>}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-ink-2">Nothing on the calendar for the next three weeks.</p>}
      </section>

      {s.classes.length > 0 && (
        <section className="card p-5 md:p-6" aria-labelledby="classes-h">
          <h2 id="classes-h" className="text-[1.25rem]">By class</h2>
          <p className="mt-1 text-[0.875rem] text-muted">Practice this week (flashcards, quiz questions and tutor questions), and how many quiz answers were right over the last 30 days.</p>
          <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label="Practice and quizzes by class">
            <table className="w-full text-left text-[0.9375rem]">
              <thead><tr className="border-b border-line text-[0.8125rem] text-muted"><th scope="col" className="py-2 pr-3 font-medium">Class</th><th scope="col" className="py-2 pr-3 text-right font-medium">This week</th><th scope="col" className="py-2 text-right font-medium">Quizzes, 30 days</th></tr></thead>
              <tbody className="tabular">
                {s.classes.map((c) => (
                  <tr key={c.name} className="border-b border-line last:border-b-0">
                    <th scope="row" className="py-2.5 pr-3 font-medium">{c.name}</th>
                    <td className="py-2.5 pr-3 text-right">{c.items7}</td>
                    <td className="py-2.5 text-right">{c.accuracy30 == null ? <span className="text-muted" aria-label="No quizzes yet">–</span> : `${c.accuracy30}% right`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="max-w-2xl text-[0.875rem] text-muted">
        {s.name} shared this page with {label}. It shows practice, the calendar and readiness only: never notes, files, chats or flashcards. Readiness is an estimate from flashcards and practice quizzes, not a grade.
        {" "}{s.name} can turn this link off at any time. It stops working on {dateFormat({ month: "long", day: "numeric" }).format(new Date(expires))}.
      </p>
    </div>
  );
}
