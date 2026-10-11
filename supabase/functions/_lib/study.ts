// Prompts, schemas, chunking and validation for study-set generation.
// Every item must point at pages that exist in the source; anything else is dropped.

export type Page = { page_no: number; text: string };
export type Chunk = { part: number; pages: Page[] };

/** About 3,500 tokens of source text per job: small enough for fast calls and rate limits. */
export const CHUNK_CHARS = 14_000;

export function chunkPages(pages: Page[], size = CHUNK_CHARS): Chunk[] {
  const chunks: Chunk[] = [];
  let cur: Page[] = [];
  let len = 0;
  for (const p of pages) {
    if (cur.length && len + p.text.length > size) {
      chunks.push({ part: chunks.length, pages: cur });
      cur = [];
      len = 0;
    }
    cur.push(p);
    len += p.text.length;
  }
  if (cur.length) chunks.push({ part: chunks.length, pages: cur });
  return chunks;
}

export function tagged(pages: Page[], word: "page" | "part") {
  return pages.map((p) => `<<${word} ${p.page_no}>>\n${p.text}`).join("\n\n");
}

// ---------- Shared voice ----------
const VOICE = `You write study material for a high school student, from their own class notes or readings.
- Use only what the source says. If you add a brief clarification, keep it consistent with the source.
- Plain, direct sentences. No hype, no exclamation marks, no emoji.
- Every item lists the page numbers it came from, taken from the <<page N>> markers. Never invent a page.
- Write math in plain text with Unicode symbols (x̄, p̂, μ, σ, √(n), ≥, ≤, ×, ÷, ², ½, π), never LaTeX.`;

// ---------- Notes ----------
export const NOTES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sections"],
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "bullets", "pages"],
        properties: {
          title: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
          pages: { type: "array", items: { type: "integer" } },
        },
      },
    },
  },
};
export type NotesOut = { sections: { title: string; bullets: string[]; pages: number[] }[] };
export const notesPrompt = (word: string) => `${VOICE}
Write clear notes for the ${word}s below: 2 to 6 sections, each with a short title and 3 to 7 bullets.
Bullets are short and specific: definitions, formulas, steps, examples, cause and effect. Use **bold** for key terms.`;

// ---------- Flashcards ----------
export const CARDS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cards"],
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["front", "back", "pages"],
        properties: {
          front: { type: "string" },
          back: { type: "string" },
          pages: { type: "array", items: { type: "integer" } },
        },
      },
    },
  },
};
export type CardsOut = { cards: { front: string; back: string; pages: number[] }[] };
export const cardsPrompt = (word: string, target: number) => `${VOICE}
Write about ${target} flashcards for the ${word}s below (fewer if there is less to learn).
- One idea per card. The front is a clear question or term; the back is a short, complete answer (one or two sentences, or a formula).
- Test understanding, not trivia. Skip page headers, names of teachers and other noise.
- No duplicates, and the answer must not appear in the question.`;

// ---------- Practice quiz ----------
export const QUIZ_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "questions"],
  properties: {
    title: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["prompt", "options", "answer_index", "hint", "explanation", "topic", "pages"],
        properties: {
          prompt: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answer_index: { type: "integer" },
          hint: { type: "string" },
          explanation: { type: "string" },
          topic: { type: "string" },
          pages: { type: "array", items: { type: "integer" } },
        },
      },
    },
  },
};
export type QuizOut = {
  title: string;
  questions: { prompt: string; options: string[]; answer_index: number; hint: string; explanation: string; topic: string; pages: number[] }[];
};
export const quizPrompt = (word: string) => `${VOICE}
Write a practice quiz of 8 to 10 multiple-choice questions from the notes below (each note lists its ${word}s).
- Exactly 4 options per question and exactly one is correct. No two options may be equivalent (for example (x^(1/2))^3 and (√x)^3 are the same), and no option may be "all of the above" or "none of the above".
- Wrong options are plausible mistakes a student might make.
- Mix recall with application (solve, compare, explain why). Vary which option letter is correct.
- hint: nudges toward the idea without giving the answer away.
- explanation: why the right answer is right, in one or two sentences.
- topic: 1 to 3 words naming the concept, for grouping mistakes later.
- title: a short name for the quiz topic.`;

// ---------- Study guide ----------
export const GUIDE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sections"],
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "body", "minutes", "pages"],
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          minutes: { type: "integer" },
          pages: { type: "array", items: { type: "integer" } },
        },
      },
    },
  },
};
export type GuideOut = { sections: { title: string; body: string; minutes: number; pages: number[] }[] };
export const guidePrompt = (word: string) => `${VOICE}
Write a study guide from the notes below (each note lists its ${word}s): 3 to 8 sections that teach the material in a sensible order.
- Each section explains one idea in plain language in 2 to 4 short paragraphs, with a worked example when the material has one.
- Use **bold** for key terms. Paragraphs are separated by a blank line; you may use "- " bullets.
- minutes: honest reading time for the section, 2 to 8.`;

// ---------- Validation ----------
const MAXLEN = { title: 120, bullet: 400, front: 300, back: 600, prompt: 600, option: 200, hint: 300, explanation: 600, topic: 40, body: 4000 };

// Safety net if LaTeX slips through: the app shows plain text, so turn common commands into symbols.
const LATEX: [RegExp, string | ((...m: string[]) => string)][] = [
  [/\\[()\[\]]/g, ""], [/\$\$?/g, ""],
  [/\\hat\s*\{?\s*p\s*\}?/g, "p̂"], [/\\bar\s*\{?\s*x\s*\}?/g, "x̄"], [/\\bar\s*\{?\s*y\s*\}?/g, "ȳ"],
  [/\\sqrt\s*\{([^{}]*)\}/g, "√($1)"], [/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_m: string, a: string, b: string) => `${/^\w+$/.test(a) ? a : `(${a})`}/${/^\w+$/.test(b) ? b : `(${b})`}`],
  [/\\(ge|geq)\b/g, "≥"], [/\\(le|leq)\b/g, "≤"], [/\\neq?\b/g, "≠"], [/\\times\b/g, "×"], [/\\div\b/g, "÷"],
  [/\\cdot\b/g, "·"], [/\\pm\b/g, "±"], [/\\approx\b/g, "≈"], [/\\infty\b/g, "∞"], [/\\to\b|\\rightarrow\b/g, "→"],
  [/\\(alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|rho|Delta|Sigma)\b/g, "§$1"],
  [/\^\{?2\}?/g, "²"], [/\^\{?3\}?/g, "³"], [/\\(text|mathrm|mathbf)\s*\{([^{}]*)\}/g, "$2"], [/[{}]/g, ""],
];
const GREEK: Record<string, string> = { alpha: "α", beta: "β", gamma: "γ", delta: "δ", theta: "θ", lambda: "λ", mu: "μ", pi: "π", sigma: "σ", rho: "ρ", Delta: "Δ", Sigma: "Σ" };
export function plainMath(s: string): string {
  if (!/[\\$]/.test(s)) return s;
  let out = s;
  for (const [re, to] of LATEX) out = out.replace(re, to as string);
  return out.replace(/§(\w+)/g, (_, g) => GREEK[g] ?? g).replace(/\\/g, "");
}

export function cleanText(s: unknown, max: number): string {
  return typeof s === "string" ? plainMath(s.replace(/\u0000/g, "")).normalize("NFKC").replace(/[\u2010-\u2013\u2212]/g, "-").replace(/[ \t]+/g, " ").trim().slice(0, max) : "";
}

/** Keep only real pages, deduplicated and sorted. */
export function realPages(pages: unknown, valid: Set<number>): number[] {
  return Array.isArray(pages) ? [...new Set(pages.filter((p) => Number.isInteger(p) && valid.has(p as number)) as number[])].sort((a, b) => a - b) : [];
}

export function validNotes(out: NotesOut, valid: Set<number>) {
  return (out.sections ?? [])
    .map((s) => ({
      title: cleanText(s.title, MAXLEN.title),
      body_md: (s.bullets ?? []).map((b) => cleanText(b, MAXLEN.bullet)).filter(Boolean).map((b) => `- ${b}`).join("\n"),
      pages: realPages(s.pages, valid),
    }))
    .filter((s) => s.title && s.body_md);
}

export function validCards(out: CardsOut, valid: Set<number>) {
  const seen = new Set<string>();
  return (out.cards ?? [])
    .map((c) => ({ front: cleanText(c.front, MAXLEN.front), back: cleanText(c.back, MAXLEN.back), pages: realPages(c.pages, valid) }))
    .filter((c) => {
      const key = c.front.toLowerCase();
      if (!c.front || !c.back || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function validQuiz(out: QuizOut, valid: Set<number>) {
  const questions = (out.questions ?? [])
    .map((q) => {
      const options = (q.options ?? []).map((o) => cleanText(o, MAXLEN.option));
      return {
        prompt: cleanText(q.prompt, MAXLEN.prompt),
        options,
        answer_index: q.answer_index,
        hint: cleanText(q.hint, MAXLEN.hint),
        explanation: cleanText(q.explanation, MAXLEN.explanation),
        topic: cleanText(q.topic, MAXLEN.topic),
        pages: realPages(q.pages, valid),
      };
    })
    .filter((q) =>
      q.prompt && q.explanation && q.options.length === 4 && q.options.every(Boolean) &&
      new Set(q.options.map((o) => o.toLowerCase())).size === 4 &&
      Number.isInteger(q.answer_index) && q.answer_index >= 0 && q.answer_index < 4,
    );
  return { title: cleanText(out.title, MAXLEN.title) || "Practice quiz", questions };
}

export function validGuide(out: GuideOut, valid: Set<number>) {
  return (out.sections ?? [])
    .map((s) => ({
      title: cleanText(s.title, MAXLEN.title),
      body_md: typeof s.body === "string" ? plainMath(s.body.replace(/\u0000/g, "")).trim().slice(0, MAXLEN.body) : "",
      minutes: Math.min(15, Math.max(1, Number.isInteger(s.minutes) ? s.minutes : 4)),
      pages: realPages(s.pages, valid),
    }))
    .filter((s) => s.title && s.body_md);
}

/** Notes as compact input for the quiz and guide jobs, capped so huge sources stay within limits. */
export function notesDigest(sections: { title: string; body_md: string; pages: number[] }[], word: string, cap = 40_000) {
  let out = "";
  for (const s of sections) {
    const block = `## ${s.title} (${word}s ${s.pages.join(", ") || "?"})\n${s.body_md}\n\n`;
    if (out.length + block.length > cap) break;
    out += block;
  }
  return out;
}
