import { Check } from "lucide-react";
import { GRADE_NAME, GRADES, graduationYearFor, type Grade } from "@/lib/grade";

/** Four big choices: "Sophomore, 10th grade, Class of 2029". */
export function GradePicker({ value, onChange }: { value: Grade | null; onChange: (g: Grade) => void }) {
  return (
    <div role="radiogroup" aria-label="Your grade" className="grid gap-3 sm:grid-cols-2">
      {GRADES.map((g) => {
        const on = value === g;
        return (
          <button
            key={g}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(g)}
            className={`card flex items-center gap-4 p-4 text-left ${on ? "!border-primary !bg-tint !shadow-[0_4px_0_var(--primary)]" : ""}`}
          >
            <span className="big-num w-14 text-center text-[2.5rem] text-brand">{g}</span>
            <span className="flex-1">
              <span className="block font-display text-[1.25rem] font-bold">{GRADE_NAME[g]}</span>
              <span className="block text-[0.9375rem] text-muted">Class of {graduationYearFor(g)}</span>
            </span>
            {on && <Check className="size-6 text-brand" />}
          </button>
        );
      })}
    </div>
  );
}
