import { cn } from "@/lib/cn";

export function Seal({ size = 40, className, decorative = false }: { size?: number; className?: string; decorative?: boolean }) {
  return (
    <img
      src="/icons/seal.png"
      alt={decorative ? "" : "Conestoga High School seal"}
      width={size}
      height={size}
      className={cn("rounded-full flex-none", className)}
    />
  );
}

export function Brand({ descriptor = true }: { descriptor?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <Seal decorative size={32} />
      <span className="leading-none">
        <span className="block font-display text-[1.375rem] font-medium tracking-[-0.01em]">Stoga.study</span>
        {descriptor && <span className="mt-1 block text-[0.8125rem] text-muted">Conestoga High School</span>}
      </span>
    </span>
  );
}
