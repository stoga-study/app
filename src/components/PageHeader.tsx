import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, children, end }: { eyebrow?: string; title: string; children?: ReactNode; end?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[0.9375rem] text-muted">{eyebrow}</p>}
        <h1 className="text-[2.125rem] md:text-[2.75rem]">{title}</h1>
        {children && <div className="mt-2 max-w-[40rem] text-muted">{children}</div>}
      </div>
      {end}
    </header>
  );
}
