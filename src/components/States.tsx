import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./ui/button";

/** Empty state: says what will appear and the one action that gets there (Brand Guidelines p. 14). */
export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <section className="card card-dashed flex flex-col items-start gap-3 p-6">
      <span className="tile soft">{icon}</span>
      <h2 className="text-[1.375rem]">{title}</h2>
      {children && <div className="text-muted">{children}</div>}
      {action && <div className="mt-1">{action}</div>}
    </section>
  );
}

/** Error state: what happened, what to do, and that nothing was lost. Never "Something went wrong". */
export function ErrorState({ title, children, onRetry, retryLabel = "Try again" }: { title: string; children?: ReactNode; onRetry?: () => void; retryLabel?: string }) {
  return (
    <section role="alert" className="card flex flex-col items-start gap-3 p-6">
      <span className="tile t4"><AlertCircle /></span>
      <h2 className="text-[1.375rem]">{title}</h2>
      {children && <div className="text-ink-2">{children}</div>}
      {onRetry && <Button onClick={onRetry}>{retryLabel}</Button>}
    </section>
  );
}

export function PageSkeleton({ label = "Getting your subjects ready. This usually takes a moment." }: { label?: string }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <div className="skeleton h-5 w-36" />
      <div className="skeleton h-10 w-60" />
      <div className="skeleton h-44 rounded-[1.5rem]" />
      <div className="skeleton h-24 rounded-[1.5rem]" />
      <p className="text-center text-[0.9375rem] text-muted">{label}</p>
    </div>
  );
}
