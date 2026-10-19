import { Link } from "react-router";
import { SetupFrame } from "@/components/SetupFrame";
import { Button } from "@/components/ui/button";

const POINTS: [string, string][] = [
  ["Your own notes", "Add a PDF, a Word file, slides or a photo of your notes."],
  ["Hints before answers", "The tutor helps you get there yourself, citing your pages."],
  ["Review at the right time", "Flashcards come back just before you'd forget them."],
];

export default function Welcome() {
  return (
    <SetupFrame title="Hints first, from your own pages.">
      <section className="flex flex-col gap-4 md:pt-6 lg:pt-12" aria-labelledby="welcome-title">
        <p className="eyebrow">Free for every Conestoga student</p>
        <h1 id="welcome-title" className="text-[2.5rem] leading-[1.03] tracking-[-0.02em] md:text-[3.5rem] lg:text-[3rem]">Study smarter from your own notes.</h1>
        <p className="max-w-[46ch] text-[1.0625rem] text-ink-2">
          Upload a PDF or class notes. Get hints first, then flashcards, quizzes and a study guide, all linked back to your pages.
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
