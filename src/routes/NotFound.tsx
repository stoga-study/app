import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <section className="ink-panel mx-auto mt-8 max-w-xl p-8 text-center">
      <span className="circle circle-big right-[-5rem] top-[-6rem] size-64" aria-hidden="true" />
      <p className="big-num text-[5rem]">404</p>
      <h1 className="mt-3 text-[1.75rem]">We could not find that page</h1>
      <p className="ink-muted mt-3">The link may be old or mistyped. Nothing you made is affected.</p>
      <Button asChild variant="inverse" className="mt-6"><Link to="/">Go to today</Link></Button>
    </section>
  );
}
