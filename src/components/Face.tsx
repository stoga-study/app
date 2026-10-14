import { useId } from "react";
import type { Face as FaceT } from "@/lib/face";
import { cn } from "@/lib/cn";

// Black-and-white ink drawings, in the spirit of Notion Faces: a white face, bold ink lines, solid
// black hair with a few white strands, small grown-up features.
const INK = "#141414";
const PAPER = "#FFFFFF";
const LINE = { stroke: INK, strokeWidth: 2.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const FINE = { ...LINE, strokeWidth: 2.1 };
const STRAND = { stroke: PAPER, strokeWidth: 1.4, strokeLinecap: "round" as const, fill: "none", opacity: 0.85 };

/** Head outlines: a little irregular, so they read as drawn rather than drafted. */
const HEAD: Record<FaceT["shape"], string> = {
  round: "M60 30 C76.5 29.6 86.2 43 86 59.6 C85.8 76.4 75.4 88.4 59.6 88.2 C44 88 34.2 76 34.2 60 C34.2 43.6 43.8 30.4 60 30 Z",
  oval: "M60 28 C74.6 27.8 83.4 41.4 83 59 C82.6 77.6 73 90.2 59.8 90 C46.6 89.8 37.4 77.4 37.2 59.4 C37 41.8 45.2 28.2 60 28 Z",
  square: "M60 29 C76.4 28.8 85.4 40 85.2 55.6 C85 68.4 83 78.2 77.2 84 C72.2 88.4 66 90 60 90 C54 90 47.6 88.2 42.8 84 C37 78 35 68.2 34.8 55.8 C34.6 40 43.6 29.2 60 29 Z",
  soft: "M60 29 C77 28.8 86.2 41 86 56.2 C85.8 70.4 79 82.2 66.2 88.8 C62.2 90.8 57.8 90.8 53.8 88.8 C41 82.2 34.2 70.2 34 56 C33.8 41 43.2 29.2 60 29 Z",
};

/** Hair behind the head (long styles, the afro, the ponytail, the bun). */
function HairBack({ f }: { f: FaceT }) {
  const p = { fill: INK, ...LINE };
  switch (f.hair) {
    case "long": return <path {...p} d="M33 60 C27 27 46 20 60 20 C75 20 93 27 87 60 L90.5 100 C85 104 77 103 72.6 98.8 L74 64 H46 L47.4 98.8 C43 103 35 104 29.5 100 Z" />;
    case "bob": return <path {...p} d="M32.6 62 C27.4 27 46 20.6 60 20.6 C74 20.6 92.6 27 87.4 62 L88.4 86 C83 90 77 89.6 74.6 87.4 L75 64 H45 L45.4 87.4 C43 89.6 37 90 31.6 86 Z" />;
    case "afro": return <path {...p} d="M60 11.5 C82 11 98 26 98 47 C98 64 88 74 76 76 L44 76 C32 74 22 64 22 47 C22 26 38 12 60 11.5 Z" />;
    case "ponytail": return <path {...p} d="M83 42 C99 42 104 62 97 84 C95.4 89 92 90 91 86 C93 72 91 58 84 54 Z" />;
    case "bun": return <circle {...p} cx={60} cy={21} r={10} />;
    default: return null;
  }
}

/** Hair over the head, with a few white strands drawn in. */
function HairFront({ f }: { f: FaceT }) {
  const p = { fill: INK, ...LINE };
  switch (f.hair) {
    case "buzz": return <path {...p} d="M36.4 51 C37 34.6 48 29.4 60 29.4 C72 29.4 83 34.6 83.6 51 C77 43.6 69 41.2 60 41.4 C51 41.2 43 43.6 36.4 51 Z" />;
    case "short": case "ponytail": case "bun":
      return (
        <g>
          <path {...p} d="M33.6 57 C29.4 33 43 24 60 24.4 C77.6 24 91 33.4 86.4 56.4 C83.4 47 78.4 41 70.6 39.6 C62.6 43.6 49.6 44.4 41.6 42.4 C37.6 46.4 35.2 51 33.6 57 Z" />
          <path {...STRAND} d="M48 30 C53 28 60 28 66 30 M44 35 C50 32 56 33 61 34" />
        </g>
      );
    case "side":
      return (
        <g>
          <path {...p} d="M33.8 58 C28.4 30.6 45.4 21.6 62 22.4 C80.4 23 92 34.6 86.4 54.6 C80.6 40.4 66.6 34.6 50.4 40.6 C43.6 43.4 37.6 49.6 33.8 58 Z" />
          <path {...STRAND} d="M56 27 C64 26 74 29 80 35 M46 33 C54 30 63 31 70 34" />
        </g>
      );
    case "spiky": return <path {...p} d="M34.6 55 L31.4 37.6 L41.4 40.6 L41.6 26.4 L51 33.8 L56.4 20.4 L63.6 32.2 L72 22.6 L75.4 36.4 L85.6 30.4 L84.4 42.6 L91 45.4 L86 54.4 C77.4 44.6 43.6 44.4 34.6 55 Z" />;
    case "curly":
      return (
        <g {...p}>
          {[[37, 50, 7.2], [41.4, 40.4, 8], [50.4, 32.6, 8.4], [61.6, 29.6, 8.6], [72.6, 32.8, 8.2], [81, 41, 7.8], [84.4, 51, 6], [35.6, 58.4, 5]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}
        </g>
      );
    case "long": case "bob":
      return (
        <g>
          <path {...p} d="M34.6 58 C32.4 31 51 26 60 26.6 C70 26 88 31 85.4 58 C80 47 71.6 40.6 60 41.4 C48.4 40.6 40 47 34.6 58 Z" />
          <path {...STRAND} d="M50 30 C56 28.6 64 28.6 70 30.4" />
        </g>
      );
    case "afro": return <path {...p} d="M35.8 54.6 C37.4 40.6 47.6 35.6 60 36.2 C72.4 35.6 82.6 40.6 84.2 54.6 C78 47.4 70 44.8 60 45 C50 44.8 42 47.4 35.8 54.6 Z" />;
    default: return null;
  }
}

function Eyes({ f }: { f: FaceT }) {
  const L = 50, R = 70, Y = 58.5;
  const dot = (x: number) => <circle cx={x} cy={Y} r={2.6} fill={INK} />;
  const arc = (x: number) => <path {...FINE} fill="none" d={`M${x - 4.2} ${Y + 1.4} Q${x} ${Y - 3.6} ${x + 4.2} ${Y + 1.4}`} />;
  switch (f.eyes) {
    case "round": return <g>{[L, R].map((x) => <g key={x}><circle cx={x} cy={Y} r={4.6} fill={PAPER} {...FINE} /><circle cx={x + 0.8} cy={Y + 0.6} r={2.1} fill={INK} /></g>)}</g>;
    case "happy": return <g>{arc(L)}{arc(R)}</g>;
    case "wide": return <g>{[L, R].map((x) => <g key={x}><ellipse cx={x} cy={Y} rx={2.9} ry={3.8} fill={INK} /><circle cx={x + 1} cy={Y - 1.3} r={1} fill={PAPER} /></g>)}</g>;
    case "sleepy": return <g>{[L, R].map((x) => <path key={x} {...FINE} fill="none" d={`M${x - 4.4} ${Y - 0.4} Q${x} ${Y + 3.6} ${x + 4.4} ${Y - 0.4}`} />)}</g>;
    case "wink": return <g>{dot(L)}{arc(R)}</g>;
    default: return <g>{dot(L)}{dot(R)}</g>;
  }
}

function Brows({ f }: { f: FaceT }) {
  const Y = 50.5;
  switch (f.brows) {
    case "flat": return <g {...FINE}><path d={`M45.6 ${Y} L54.2 ${Y - 0.6}`} /><path d={`M65.8 ${Y - 0.6} L74.4 ${Y}`} /></g>;
    case "raised": return <g {...FINE} fill="none"><path d={`M45 ${Y + 1} Q49.6 ${Y - 3.6} 54.4 ${Y}`} /><path d={`M65.6 ${Y} Q70.4 ${Y - 3.6} 75 ${Y + 1}`} /></g>;
    case "focused": return <g {...FINE}><path d={`M45.4 ${Y - 1.6} L54.4 ${Y + 1.2}`} /><path d={`M65.6 ${Y + 1.2} L74.6 ${Y - 1.6}`} /></g>;
    case "thick": return <g {...LINE} strokeWidth={4}><path d={`M45.6 ${Y} L54.2 ${Y - 0.4}`} /><path d={`M65.8 ${Y - 0.4} L74.4 ${Y}`} /></g>;
    default: return null;
  }
}

function Mouth({ f }: { f: FaceT }) {
  switch (f.mouth) {
    case "grin": return <path {...FINE} fill={PAPER} d="M52.4 73.6 Q60 82.6 67.6 73.6 Q60 75.2 52.4 73.6 Z" />;
    case "open": return <ellipse cx={60} cy={76.4} rx={3.6} ry={3.2} fill={INK} />;
    case "flat": return <path {...FINE} d="M55 77 Q60 77.6 65 76.8" />;
    case "smirk": return <path {...FINE} fill="none" d="M54.4 77 Q62 78.4 66.6 73.8" />;
    case "tongue": return <g><path {...FINE} fill={PAPER} d="M52.4 73.6 Q60 82.6 67.6 73.6 Q60 75.2 52.4 73.6 Z" /><path {...FINE} strokeWidth={1.6} fill={INK} d="M57.4 77.6 Q60 83.4 62.6 77.6 Z" /></g>;
    default: return <path {...FINE} fill="none" d="M53.6 74.6 Q60 79.6 66.4 74.4" />;
  }
}

function Extra({ f, layer }: { f: FaceT; layer: "face" | "top" }) {
  if (layer === "face") {
    switch (f.extra) {
      case "glasses": return <g {...FINE} fill="none"><rect x={42.6} y={53} width={15} height={11} rx={3} /><rect x={62.4} y={53} width={15} height={11} rx={3} /><path d="M57.6 57.4 Q60 55.8 62.4 57.4" /><path d="M42.6 56 L36 54.6 M77.4 56 L84 54.6" /></g>;
      case "round-glasses": return <g {...FINE} fill="none"><circle cx={50} cy={58.5} r={6.6} /><circle cx={70} cy={58.5} r={6.6} /><path d="M56.6 57.6 Q60 55.4 63.4 57.6" /><path d="M43.4 57.4 L36 55.6 M76.6 57.4 L84 55.6" /></g>;
      case "sunglasses": return <g {...FINE} fill={INK}><path d="M41.6 53.4 H58 V58 C58 63 54.6 65 49.8 65 C45 65 41.6 63 41.6 58 Z" /><path d="M62 53.4 H78.4 V58 C78.4 63 75 65 70.2 65 C65.4 65 62 63 62 58 Z" /><path d="M58 55.6 H62 M41.6 55 L36 54 M78.4 55 L84 54" fill="none" /></g>;
      case "blush": return <g {...FINE} strokeWidth={1.5} fill="none">{[44, 47, 50].map((x) => <path key={x} d={`M${x} 70.4 L${x + 2.4} 66.8`} />)}{[70, 73, 76].map((x) => <path key={x} d={`M${x} 70.4 L${x + 2.4} 66.8`} />)}</g>;
      case "earring": return <circle cx={34.6} cy={70} r={2.4} fill={PAPER} {...FINE} strokeWidth={1.8} />;
      default: return null;
    }
  }
  switch (f.extra) {
    case "headphones": return <g {...LINE}><path fill="none" strokeWidth={4.4} d="M31.4 60 C28 22 92 22 88.6 60" /><rect x={24.4} y={53.6} width={10} height={17} rx={4.4} fill={INK} /><rect x={85.6} y={53.6} width={10} height={17} rx={4.4} fill={INK} /></g>;
    case "cap": return <g {...LINE}><path fill={INK} d="M33.6 47.4 C33.4 27.6 86.6 27.6 86.4 47.4 Z" /><path fill={INK} d="M58 47.4 H101 C100.6 52.6 91 55 80 53.2 L58 51.4 Z" /><path {...STRAND} d="M60 30 V45" /></g>;
    default: return null;
  }
}

/** Clothes: drawn shoulders with a collar, in white or ink. */
function Top({ f, clip }: { f: FaceT; clip: string }) {
  const body = "M20 124 C21.6 106.4 36 99.4 50.6 98.2 L69.4 98.2 C84 99.4 98.4 106.4 100 124 Z";
  switch (f.top) {
    case "black": return <g><path {...LINE} fill={INK} d={body} /><path {...STRAND} strokeWidth={1.8} d="M51 99 Q60 106.6 69 99" /></g>;
    case "collar": return <g><path {...LINE} fill={PAPER} d={body} /><path {...FINE} fill={PAPER} d="M50.6 98.2 L56 108.6 L60 101.6 L64 108.6 L69.4 98.2" /><path {...FINE} d="M60 104 V124" /></g>;
    case "hoodie": return <g><path {...LINE} fill={PAPER} d={body} /><path {...FINE} fill="none" d="M44 100.6 C46 110 74 110 76 100.6" /><path {...FINE} d="M55 108 V116 M65 108 V116" /></g>;
    case "stripes": return <g><path {...LINE} fill={PAPER} d={body} /><g {...FINE} clipPath={`url(#${clip}-top)`}>{[107, 113, 119].map((y) => <path key={y} d={`M10 ${y} H110`} />)}</g><path {...LINE} fill="none" d={body} /><path {...FINE} fill="none" d="M51 98.6 Q60 105.6 69 98.6" /></g>;
    default: return <g><path {...LINE} fill={PAPER} d={body} /><path {...FINE} fill="none" d="M51 98.6 Q60 105.6 69 98.6" /></g>;
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
      <defs>
        <clipPath id={clip}><circle cx={60} cy={60} r={60} /></clipPath>
        <clipPath id={`${clip}-top`}><path d="M20 124 C21.6 106.4 36 99.4 50.6 98.2 L69.4 98.2 C84 99.4 98.4 106.4 100 124 Z" /></clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width={120} height={120} fill={face.bg} />
        {/* Drawn a little larger than the frame, so the face fills it the way Notion's do. */}
        <g transform="translate(60 66) scale(1.17) translate(-60 -64)">
        <HairBack f={face} />
        <Top f={face} clip={clip} />
        <path {...LINE} fill={PAPER} d="M51.6 85 L50.8 100 L69.2 100 L68.4 85 Z" />
        <path {...LINE} fill={PAPER} d="M36 53.6 C28.4 51.4 27.2 67.6 36.4 67.4 Z" />
        <path {...LINE} fill={PAPER} d="M84 53.6 C91.6 51.4 92.8 67.6 83.6 67.4 Z" />
        <path {...LINE} fill={PAPER} d={HEAD[face.shape]} />
        <HairFront f={face} />
        <g className="face-look">
          <g className="face-eyes"><Eyes f={face} /></g>
          <Brows f={face} />
        </g>
        <path {...FINE} fill="none" d="M60.6 58.6 C59.6 63.4 57.4 66 58.4 67.4 C59.4 68.4 61.4 68.2 62.6 67.4" />
        <g className="face-mouth"><Mouth f={face} /></g>
        <Extra f={face} layer="face" />
        <Extra f={face} layer="top" />
        </g>
      </g>
    </svg>
  );
}
