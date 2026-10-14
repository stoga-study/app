// Faces: avatars built from parts, in the spirit of Notion Faces. A face is a small object of part
// choices; anything unknown falls back to a default, so a saved face always draws. Pure, unit tested.

export const PARTS = {
  shape: ["round", "oval", "square", "soft"],
  hair: ["none", "buzz", "short", "side", "curly", "spiky", "long", "bob", "bun", "ponytail", "afro"],
  eyes: ["dots", "round", "happy", "wide", "sleepy", "wink"],
  brows: ["none", "flat", "raised", "focused", "thick"],
  mouth: ["smile", "grin", "open", "flat", "smirk", "tongue"],
  extra: ["none", "glasses", "round-glasses", "sunglasses", "headphones", "cap", "earring", "blush"],
  top: ["tee", "black", "collar", "hoodie", "stripes"],
  bg: ["#FFFFFF", "#F7E1E6", "#E3ECFF", "#DFF3E8", "#FFF0D2", "#ECE4FF", "#ECEAE8"],
} as const;

export type Part = keyof typeof PARTS;
export type Face = { [K in Part]: (typeof PARTS)[K][number] };

export const PART_LABEL: Record<Part, string> = {
  shape: "Face", hair: "Hair", eyes: "Eyes", brows: "Brows", mouth: "Mouth", extra: "Extras", top: "Clothes", bg: "Background",
};

/** The coach everyone starts with: curly hair, happy eyes, a grin, headphones and a hoodie. */
export const DEFAULT_COACH_FACE: Face = { shape: "round", hair: "curly", eyes: "happy", brows: "raised", mouth: "grin", extra: "headphones", top: "hoodie", bg: "#F7E1E6" };

/** A face from any saved value: known choices kept, anything else from the fallback. */
export function toFace(v: unknown, fallback: Face = DEFAULT_COACH_FACE): Face {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const out = { ...fallback } as Record<Part, string>;
  for (const k of Object.keys(PARTS) as Part[]) {
    const val = o[k];
    if (typeof val === "string" && (PARTS[k] as readonly string[]).includes(val)) out[k] = val;
  }
  return out as Face;
}

/** A small seeded generator, so a face from a seed (like a user id) is always the same. */
export function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** A random face that looks good: no sunglasses-plus-wink clashes, and calmer odds for the loud extras. */
export function randomFace(rand: () => number = Math.random): Face {
  const pick = <K extends Part>(k: K): Face[K] => PARTS[k][Math.floor(rand() * PARTS[k].length)] as Face[K];
  const f = (Object.keys(PARTS) as Part[]).reduce((acc, k) => ({ ...acc, [k]: pick(k) }), {} as Face);
  if (rand() < 0.45) f.extra = "none";
  if (f.extra === "sunglasses") f.brows = "none";
  if (f.hair === "none" && rand() < 0.6) f.hair = "short";
  return f;
}

/** A student's starting face, the same every time for the same account. */
export const faceFor = (seed: string) => randomFace(seeded(seed));

// The coach's character.
export const VIBES = ["chill", "hype", "direct", "calm"] as const;
export type Vibe = (typeof VIBES)[number];
export const VIBE_LABEL: Record<Vibe, { name: string; blurb: string }> = {
  chill: { name: "Chill", blurb: "Warm and real, like an older student who has your back." },
  hype: { name: "Hype", blurb: "Big energy, cheers every win, keeps you moving." },
  direct: { name: "Straight up", blurb: "No fluff. The answer, then the next step." },
  calm: { name: "Calm", blurb: "Gentle and steady, good for stressful weeks." },
};
export const LENGTHS = ["short", "normal", "detailed"] as const;
export type ReplyLength = (typeof LENGTHS)[number];

export type CoachSettings = { name: string; face: Face; vibe: Vibe; length: ReplyLength };
export const DEFAULT_COACH: CoachSettings = { name: "Coach", face: DEFAULT_COACH_FACE, vibe: "chill", length: "normal" };

/** The coach from a saved profile value, with safe defaults for anything missing or odd. */
export function toCoach(v: unknown): CoachSettings {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const name = typeof o.name === "string" ? o.name.replace(/\s+/g, " ").trim().slice(0, 24) : "";
  return {
    name: name || DEFAULT_COACH.name,
    face: toFace(o.face),
    vibe: (VIBES as readonly string[]).includes(String(o.vibe)) ? (o.vibe as Vibe) : DEFAULT_COACH.vibe,
    length: (LENGTHS as readonly string[]).includes(String(o.length)) ? (o.length as ReplyLength) : DEFAULT_COACH.length,
  };
}
