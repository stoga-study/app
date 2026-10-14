import { useId } from "react";
import type { Face as FaceT } from "@/lib/face";
import { cn } from "@/lib/cn";

const INK = "#231B1E";
const LINE = { stroke: INK, strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** Head outlines, centred on (60, 60). */
const HEAD: Record<FaceT["shape"], string> = {
  round: "M60 29 C79 29 90 43 90 61 C90 80 77 92 60 92 C43 92 30 80 30 61 C30 43 41 29 60 29 Z",
  oval: "M60 27 C76 27 86 41 86 60 C86 81 75 94 60 94 C45 94 34 81 34 60 C34 41 44 27 60 27 Z",
  square: "M44 29 H76 C85 29 90 35 90 44 V74 C90 86 80 93 68 93 H52 C40 93 30 86 30 74 V44 C30 35 35 29 44 29 Z",
  soft: "M60 28 C80 28 90 41 90 57 C90 72 84 84 72 90 C66 93 54 93 48 90 C36 84 30 72 30 57 C30 41 40 28 60 28 Z",
};

/** Hair drawn behind the head (long styles, the afro, the ponytail). */
function HairBack({ f }: { f: FaceT }) {
  const p = { fill: f.hairColor, ...LINE };
  switch (f.hair) {
    case "long": return <path {...p} d="M28 58 C24 26 96 26 92 58 L96 100 C88 103 82 102 78 98 L80 64 H40 L42 98 C38 102 32 103 24 100 Z" />;
    case "bob": return <path {...p} d="M27 62 C24 26 96 26 93 62 L94 84 C88 88 82 88 80 86 L80 62 H40 L40 86 C38 88 32 88 26 84 Z" />;
    case "afro": return <circle {...p} cx={60} cy={50} r={40} />;
    case "ponytail": return <path {...p} d="M84 44 C102 46 104 70 96 84 C94 72 92 60 84 56 Z" />;
    case "bun": return <circle {...p} cx={60} cy={22} r={11} />;
    default: return null;
  }
}

/** Hair drawn over the head. */
function HairFront({ f }: { f: FaceT }) {
  const p = { fill: f.hairColor, ...LINE };
  switch (f.hair) {
    case "buzz": return <path {...p} d="M31 52 C31 30 89 30 89 52 C80 42 40 42 31 52 Z" />;
    case "short": case "ponytail": case "bun": return <path {...p} d="M29 56 C25 26 95 26 91 56 C86 46 77 41 66 43 C58 38 46 40 38 46 C34 48 31 52 29 56 Z" />;
    case "side": return <path {...p} d="M29 58 C24 22 96 22 91 54 C82 38 64 36 46 44 C38 48 32 53 29 58 Z" />;
    case "spiky": return <path {...p} d="M30 54 L28 36 L38 40 L40 26 L50 34 L56 20 L64 32 L72 22 L76 36 L86 30 L84 42 L92 44 L90 54 C80 44 40 44 30 54 Z" />;
    case "long": case "bob": return <path {...p} d="M30 58 C28 28 92 28 90 58 C84 46 74 40 60 41 C46 40 36 46 30 58 Z" />;
    case "curly":
      return (
        <g {...p}>
          {[[34, 48, 8], [40, 38, 9], [51, 31, 9], [63, 29, 9], [75, 33, 9], [84, 42, 8], [87, 52, 6], [33, 57, 6]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}
        </g>
      );
    case "afro": return <path {...p} d="M31 56 C33 40 46 36 60 38 C74 36 87 40 89 56 C84 50 74 46 60 47 C46 46 36 50 31 56 Z" />;
    default: return null;
  }
}

function Eyes({ f }: { f: FaceT }) {
  const L = 48, R = 72, Y = 60;
  const dot = (x: number) => <circle cx={x} cy={Y} r={3.4} fill={INK} />;
  const arc = (x: number) => <path {...LINE} fill="none" d={`M${x - 5} ${Y + 2} Q${x} ${Y - 5} ${x + 5} ${Y + 2}`} />;
  switch (f.eyes) {
    case "round": return <g>{[L, R].map((x) => <g key={x}><circle cx={x} cy={Y} r={6} fill="#fff" {...LINE} strokeWidth={2.5} /><circle cx={x + 1} cy={Y + 1} r={2.8} fill={INK} /></g>)}</g>;
    case "happy": return <g>{arc(L)}{arc(R)}</g>;
    case "wide": return <g>{[L, R].map((x) => <g key={x}><ellipse cx={x} cy={Y} rx={4} ry={5.2} fill={INK} /><circle cx={x + 1.4} cy={Y - 1.8} r={1.4} fill="#fff" /></g>)}</g>;
    case "sleepy": return <g>{[L, R].map((x) => <path key={x} {...LINE} fill="none" d={`M${x - 5} ${Y} Q${x} ${Y + 5} ${x + 5} ${Y}`} />)}</g>;
    case "wink": return <g>{dot(L)}{arc(R)}</g>;
    default: return <g>{dot(L)}{dot(R)}</g>;
  }
}

function Brows({ f }: { f: FaceT }) {
  const Y = 49;
  switch (f.brows) {
    case "flat": return <g {...LINE}><path d={`M43 ${Y} H53`} /><path d={`M67 ${Y} H77`} /></g>;
    case "raised": return <g {...LINE} fill="none"><path d={`M42 ${Y + 1} Q48 ${Y - 5} 54 ${Y}`} /><path d={`M66 ${Y} Q72 ${Y - 5} 78 ${Y + 1}`} /></g>;
    case "focused": return <g {...LINE}><path d={`M43 ${Y - 2} L54 ${Y + 1}`} /><path d={`M66 ${Y + 1} L77 ${Y - 2}`} /></g>;
    case "thick": return <g {...LINE} strokeWidth={5}><path d={`M43 ${Y} H53`} /><path d={`M67 ${Y} H77`} /></g>;
    default: return null;
  }
}

function Mouth({ f }: { f: FaceT }) {
  switch (f.mouth) {
    case "grin": return <path {...LINE} fill="#fff" d="M49 72 Q60 86 71 72 Z" />;
    case "open": return <ellipse cx={60} cy={76} rx={5} ry={4.5} fill={INK} />;
    case "flat": return <path {...LINE} d="M53 76 H67" />;
    case "smirk": return <path {...LINE} fill="none" d="M52 76 Q62 79 69 72" />;
    case "tongue": return <g><path {...LINE} fill="#fff" d="M49 72 Q60 86 71 72 Z" /><path d="M56 78 Q60 86 64 78 Z" fill="#F06E9C" stroke={INK} strokeWidth={2} strokeLinejoin="round" /></g>;
    default: return <path {...LINE} fill="none" d="M51 73 Q60 81 69 73" />;
  }
}

function Extra({ f, layer }: { f: FaceT; layer: "face" | "top" }) {
  if (layer === "face") {
    switch (f.extra) {
      case "glasses": return <g {...LINE} fill="none"><rect x={39} y={53} width={18} height={14} rx={4} /><rect x={63} y={53} width={18} height={14} rx={4} /><path d="M57 59 H63" /></g>;
      case "round-glasses": return <g {...LINE} fill="none"><circle cx={48} cy={60} r={8.5} /><circle cx={72} cy={60} r={8.5} /><path d="M56.5 59 Q60 56 63.5 59" /></g>;
      case "sunglasses": return <g {...LINE} fill={INK}><path d="M38 54 H58 V60 C58 66 54 68 48 68 C42 68 38 66 38 60 Z" /><path d="M62 54 H82 V60 C82 66 78 68 72 68 C66 68 62 66 62 60 Z" /><path d="M58 57 H62" fill="none" /></g>;
      case "blush": return <g fill="#F06E9C" opacity={0.45}><ellipse cx={42} cy={70} rx={5} ry={3} /><ellipse cx={78} cy={70} rx={5} ry={3} /></g>;
      case "earring": return <circle cx={29} cy={72} r={2.8} fill="#E9A23B" stroke={INK} strokeWidth={2} />;
      default: return null;
    }
  }
  switch (f.extra) {
    case "headphones": return <g {...LINE}><path fill="none" strokeWidth={5} d="M27 62 C25 22 95 22 93 62" /><rect x={20} y={56} width={11} height={18} rx={5} fill={f.shirt} /><rect x={89} y={56} width={11} height={18} rx={5} fill={f.shirt} /></g>;
    case "cap": return <g {...LINE} fill={f.shirt}><path d="M30 48 C30 26 90 26 90 48 Z" /><path d="M58 48 H100 C100 54 90 56 80 54 L58 52 Z" /></g>;
    default: return null;
  }
}

/**
 * A face. `mood` animates it: "idle" blinks now and then, "thinking" glances around, "talking" moves
 * the mouth. Reduced motion turns all of it off (index.css).
 */
export function Face({ face, size = 48, mood = "idle", className, title }: { face: FaceT; size?: number; mood?: "still" | "idle" | "thinking" | "talking"; className?: string; title?: string }) {
  const clip = useId();
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={cn("face flex-none", `face-${mood}`, className)} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs><clipPath id={clip}><circle cx={60} cy={60} r={60} /></clipPath></defs>
      <g clipPath={`url(#${clip})`}>
        <rect width={120} height={120} fill={face.bg} />
        <HairBack f={face} />
        <path {...LINE} fill={face.shirt} d="M18 124 C20 104 38 96 60 96 C82 96 100 104 102 124 Z" />
        <path {...LINE} fill={face.skin} d="M52 86 V100 C56 103 64 103 68 100 V86 Z" />
        <circle {...LINE} cx={30} cy={63} r={6.5} fill={face.skin} />
        <circle {...LINE} cx={90} cy={63} r={6.5} fill={face.skin} />
        <path {...LINE} fill={face.skin} d={HEAD[face.shape]} />
        <HairFront f={face} />
        <g className="face-look">
          <g className="face-eyes"><Eyes f={face} /></g>
          <Brows f={face} />
        </g>
        <path {...LINE} fill="none" strokeWidth={2.5} d="M60 63 Q57 69 61 70" />
        <g className="face-mouth"><Mouth f={face} /></g>
        <Extra f={face} layer="face" />
        <Extra f={face} layer="top" />
      </g>
    </svg>
  );
}
