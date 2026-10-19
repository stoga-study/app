import { Link } from "react-router";
import { SetupFrame } from "@/components/SetupFrame";
import { Button } from "@/components/ui/button";

const POINTS: [string, string][] = [
  ["Your CHS classes, already in", "Every core course from the Conestoga Program of Studies. Pick yours and you're set up."],
  ["Synced with Schoology", "Link your calendar once. Tests and due dates show up, and your plan moves when they do."],
  ["Studies from your teacher's material", "Add your notes or slides. Cards, quizzes and tutor answers come from what your class actually covered."],
];

export default function Welcome() {
  return (
    <SetupFrame>
      <section className="flex flex-col gap-4 md:pt-6 lg:pt-12" aria-labelledby="welcome-title">
        <p className="eyebrow">Free for every Conestoga student</p>
        <h1 id="welcome-title" className="text-[2.5rem] leading-[1.03] tracking-[-0.02em] md:text-[3.5rem] lg:text-[3rem]">The study app that already knows Stoga.</h1>
        <p className="max-w-[46ch] text-[1.0625rem] text-ink-2">
          Your classes, your Schoology due dates, your next test and your own notes, in one place. It plans your week and helps you get there yourself, without doing the work for you.
        </p>
      </section>

      <ul className="flex flex-col md:max-w-xl">
        {POINTS.map(([t, d]) => (
          <li key={t} className="border-t border-line py-4">
            <p className="font-semibold">{t}</p>
            <p className="mt-0.5 text-[0.9375rem] text-muted">{d}</p>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-3 md:mt-2 md:flex-row md:items-center">
        <Button asChild block className="md:w-auto md:min-w-56"><Link to="/sign-in">Get started</Link></Button>
        <Button asChild block variant="ghost" className="md:w-auto"><Link to="/sign-in">I already have an account</Link></Button>
      </div>
    </SetupFrame>
  );
}
