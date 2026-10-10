import { Upload } from "lucide-react";
import { Link } from "react-router";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";

function today() {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
}

export default function Home() {
  return (
    <>
      <PageHeader eyebrow={today()} title="Today" />
      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <section className="ink-panel burgundy p-6" aria-labelledby="due-title">
          <span className="circle circle-big right-[-4rem] top-[-5rem] size-56" aria-hidden="true" />
          <p id="due-title" className="text-[0.9375rem] text-[#F7EAEC]">Flashcards due today</p>
          <p className="big-num mt-1 text-[6rem]">0</p>
          <p className="mt-2 max-w-[22rem] text-[0.9375rem] text-[#F7EAEC]">Add notes and your first cards will appear here.</p>
        </section>
        <section className="card card-dashed flex flex-col justify-center gap-3 p-6">
          <span className="tile soft"><Upload /></span>
          <h2 className="text-[1.375rem]">Add notes or a PDF</h2>
          <p className="text-muted">We turn it into notes, flashcards, a practice quiz and a study guide, all linked to your pages.</p>
          <Button asChild className="self-start"><Link to="/upload"><Upload /> Add your first notes</Link></Button>
        </section>
      </div>
    </>
  );
}
