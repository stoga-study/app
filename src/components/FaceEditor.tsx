import { Dices } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { PART_LABEL, PARTS, randomFace, type Face as FaceT, type Part } from "@/lib/face";
import { Face } from "./Face";

const TABS: { label: string; parts: Part[] }[] = [
  { label: "Face", parts: ["shape"] },
  { label: "Hair", parts: ["hair"] },
  { label: "Eyes", parts: ["eyes", "brows"] },
  { label: "Mouth", parts: ["mouth"] },
  { label: "Extras", parts: ["extra"] },
  { label: "Style", parts: ["top", "bg"] },
];
const SWATCH: Part[] = ["bg"];

/** Build a face from parts: a big live preview, part tabs, each choice shown on your own face, and Shuffle. */
export function FaceEditor({ value, onChange, title }: { value: FaceT; onChange: (f: FaceT) => void; title: string }) {
  const [tab, setTab] = useState(0);
  const [hop, setHop] = useState(0);
  const change = (f: FaceT) => {
    onChange(f);
    setHop((n) => n + 1);
  };

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <div className="flex flex-col items-center gap-3 md:sticky md:top-6 md:w-56">
        <div key={hop} className={hop ? "face-hop" : undefined}>
          <Face face={value} size={176} mood="idle" title={title} />
        </div>
        <button type="button" onClick={() => change(randomFace())} className="pill-option transition-transform active:scale-95">
          <Dices /> Shuffle
        </button>
      </div>
      <div className="min-w-0 flex-1">
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-2 md:mx-0 md:flex-wrap md:px-0" role="tablist" aria-label="Parts">
          {TABS.map((t, i) => (
            <button key={t.label} type="button" role="tab" aria-selected={tab === i} className="pill-option flex-none" onClick={() => setTab(i)}>{t.label}</button>
          ))}
        </div>
        <div role="tabpanel" className="mt-2 flex flex-col gap-4">
          {TABS[tab].parts.map((part) => (
            <fieldset key={part}>
              <legend className="mb-2 font-bold">{PART_LABEL[part]}</legend>
              {SWATCH.includes(part) ? (
                <div className="flex flex-wrap gap-2">
                  {PARTS[part].map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`${PART_LABEL[part]} ${c}`}
                      aria-pressed={value[part] === c}
                      onClick={() => change({ ...value, [part]: c })}
                      className={cn("size-11 rounded-full border-2 border-line transition-transform hover:scale-110", value[part] === c && "ring-4 ring-primary ring-offset-2 ring-offset-bg")}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {PARTS[part].map((o) => (
                    <button
                      key={o}
                      type="button"
                      aria-label={`${PART_LABEL[part]}: ${o.replace("-", " ")}`}
                      aria-pressed={value[part] === o}
                      onClick={() => change({ ...value, [part]: o })}
                      className={cn("grid place-items-center rounded-2xl border-2 border-line bg-card p-1 transition-transform hover:-translate-y-0.5", value[part] === o && "!border-primary bg-tint")}
                    >
                      <Face face={{ ...value, [part]: o }} size={64} mood="still" />
                    </button>
                  ))}
                </div>
              )}
            </fieldset>
          ))}
        </div>
      </div>
    </div>
  );
}
