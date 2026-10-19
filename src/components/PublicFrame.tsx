import type { ReactNode } from "react";
import { Link } from "react-router";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";

/** Public pages anyone can open without signing in (updates, known issues): the brand, a way into the app, a footer. */
export function PublicFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-4 md:px-8">
          <a href="https://stoga.study" className="text-ink no-underline"><Brand descriptor={false} /></a>
          <Button asChild size="sm"><Link to="/">Open Stoga.study</Link></Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-8 pb-16 md:px-8 md:pt-12">{children}</main>
      <footer className="border-t border-line">
        <nav aria-label="Public pages" className="mx-auto flex max-w-3xl flex-wrap gap-x-5 gap-y-2 px-5 py-6 text-[0.875rem] md:px-8">
          <Link to="/updates" className="text-muted hover:text-ink">Updates</Link>
          <Link to="/known-issues" className="text-muted hover:text-ink">Known issues</Link>
          <a href="https://stoga.study" className="text-muted hover:text-ink">stoga.study</a>
          <span className="text-muted">Free for every Conestoga student. A public beta.</span>
        </nav>
      </footer>
    </div>
  );
}
