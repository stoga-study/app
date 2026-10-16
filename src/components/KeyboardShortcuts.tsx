import { Keyboard, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { GO, HELP, isTyping } from "@/lib/shortcuts";

/** Shortcuts that work anywhere ("/" search, "?" help, "G" then a letter to jump), and the help sheet. */
export function KeyboardShortcuts() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const pendingG = useRef(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" && open) return setOpen(false);
      if (isTyping(e.target) || open) return;
      if (e.key === "?") {
        e.preventDefault();
        opener.current = document.activeElement;
        setOpen(true);
      } else if (e.key === "/") {
        e.preventDefault();
        navigate("/search");
      } else if (e.key.toLowerCase() === "g") {
        pendingG.current = Date.now();
      } else if (Date.now() - pendingG.current < 1200 && GO[e.key.toLowerCase()]) {
        pendingG.current = 0;
        e.preventDefault();
        navigate(GO[e.key.toLowerCase()].path);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, open]);

  // Focus the sheet when it opens, and go back to where you were when it closes.
  useEffect(() => {
    if (open) closeRef.current?.focus();
    else (opener.current as HTMLElement | null)?.focus?.();
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setOpen(false)}>
      <section role="dialog" aria-modal="true" aria-labelledby="keys-title" className="rise card max-h-[85dvh] w-full max-w-lg overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <Keyboard className="size-5 text-brand" aria-hidden="true" />
          <h2 id="keys-title" className="flex-1 text-[1.375rem]">Keyboard shortcuts</h2>
          <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid size-10 place-items-center rounded-full hover:bg-soft"><X className="size-5" /></button>
        </div>
        {HELP.map((g) => (
          <div key={g.area} className="mt-3">
            <h3 className="mb-1 text-[0.875rem] font-bold uppercase tracking-wide text-muted">{g.area}</h3>
            <dl className="divide-y divide-line">
              {g.keys.map(([k, what]) => (
                <div key={k} className="flex items-center justify-between gap-4 py-1.5">
                  <dt className="text-[0.9375rem]">{what}</dt>
                  <dd><kbd className="rounded-md border-2 border-line bg-soft px-2 py-0.5 font-mono text-[0.8125rem]">{k}</kbd></dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </section>
    </div>
  );
}
