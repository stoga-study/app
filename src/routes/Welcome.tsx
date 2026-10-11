import { Bell, Lightbulb, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Seal } from "@/components/Brand";
import { Button } from "@/components/ui/button";

const ROWS: [ReactNode, string, string, string][] = [
  [<Upload />, "", "Add your notes", "A PDF, Word file or pasted text"],
  [<Lightbulb />, "t2", "Hints before answers", "The tutor helps you get there yourself"],
  [<Bell />, "t3", "Review at the right time", "Cards return just before you would forget"],
];

export default function Welcome() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <section className="ink-panel p-6 pb-7" aria-labelledby="welcome-title">
        <span className="circle circle-big right-[-6rem] top-[-7rem] size-64" aria-hidden="true" />
        <span className="circle circle-hot right-12 top-24 size-10" aria-hidden="true" />
        <div className="flex items-center gap-3">
          <Seal size={40} />
          <span className="font-display text-[1.375rem] font-bold tracking-[-0.03em]">Stoga.study</span>
        </div>
        <span className="sticker mt-6 !text-[0.875rem]">Free for every student</span>
        <h1 id="welcome-title" className="mt-4 text-[2.375rem] leading-[1.02] tracking-[-0.035em]">Study smarter from your own notes.</h1>
        <p className="ink-muted mt-3 text-[0.9375rem]">
          Upload a PDF or class notes. Get hints first, then cards, quizzes and a study guide, all linked back to your pages.
        </p>
      </section>

      <ul className="flex flex-col gap-4">
        {ROWS.map(([icon, cls, t, d]) => (
          <li key={t} className="flex items-start gap-4">
            <span className={`tile ${cls} !size-11 !rounded-[0.8rem] [&_svg]:!size-5`}>{icon}</span>
            <div>
              <p className="font-bold">{t}</p>
              <p className="text-[0.9375rem] text-muted">{d}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-3">
        <Button asChild block><Link to="/sign-in">Get started</Link></Button>
        <Button asChild block variant="ghost"><Link to="/sign-in">I already have an account</Link></Button>
      </div>
    </main>
  );
}
