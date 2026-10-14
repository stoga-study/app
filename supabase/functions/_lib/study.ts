// Prompts, schemas, chunking and validation for study-set generation.
// Every item must point at pages that exist in the source; anything else is dropped.

/** Bump when the study-set prompts or validators change, so shared sets made with older prompts are not reused. */
export const GEN_VERSION = 3;

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

export function tagged(pages: Page[], word: "page" | "part" | "slide") {
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
export const cardsPrompt = (word: string, target: number, avoid: string[] = []) => `${VOICE}
Write ${target} flashcards for the ${word}s below. The student chose this number, so write exactly ${target} unless the ${word}s truly do not have enough to learn.
- One idea per card. The front is a clear question or term; the back is a short, complete answer (one or two sentences, or a formula).
- Test understanding, not trivia. Skip page headers, names of teachers and other noise.
- No duplicates, and the answer must not appear in the question.${avoid.length ? `\n- The student already has cards with these fronts, so do not repeat them: ${avoid.slice(0, 80).join(" | ")}` : ""}`;

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
export const quizPrompt = (word: string, count: number, fromNotes: boolean) => `${VOICE}
Write a practice quiz of exactly ${count} multiple-choice questions from the ${fromNotes ? `notes below (each note lists its ${word}s)` : `${word}s below`}.
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
export const guidePrompt = (word: string, count: number, fromNotes: boolean, focus?: string) => `${VOICE}
Write a study guide from the ${fromNotes ? `notes below (each note lists its ${word}s)` : `${word}s below`}: exactly ${count} sections that teach the material in a sensible order.
- Each section explains one idea in plain language in 2 to 4 short paragraphs, with a worked example when the material has one.
- Use **bold** for key terms. Paragraphs are separated by a blank line; you may use "- " bullets.
- minutes: honest reading time for the section, 2 to 8.${focus ? `\n- Focus: the student asked for this guide shaped around "${focus}". Choose and order sections to serve that, and say in one line at the very start of the first section's body how this guide is focused around it. Stay grounded in the material; do not invent anything it does not cover.` : ""}`;

// ---------- Summary ----------
export const SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["body"],
  properties: { body: { type: "string" } },
};
export type SummaryOut = { body: string };
export const summaryPrompt = (word: string, fromNotes: boolean) => `${VOICE}
Write a short summary of the ${fromNotes ? `notes below (each note lists its ${word}s)` : `${word}s below`}: 120 to 220 words, 2 to 4 short paragraphs, giving the shape of the whole thing (what it covers and how the parts relate), not a list of facts. Use **bold** for the 3 to 6 terms that matter most.`;

// ---------- Key terms ----------
export const TERMS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["terms"],
  properties: {
    terms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["term", "definition", "pages"],
        properties: {
          term: { type: "string" },
          definition: { type: "string" },
          pages: { type: "array", items: { type: "integer" } },
        },
      },
    },
  },
};
export type TermsOut = { terms: { term: string; definition: string; pages: number[] }[] };
export const termsPrompt = (word: string, target: number) => `${VOICE}
Write a glossary of ${target} key terms for the ${word}s below. The student chose this number, so write exactly ${target} unless the ${word}s truly do not name that many distinct terms worth knowing.
- term: the word or short phrase exactly as it would appear on a test, not a question.
- definition: one clear sentence, in your own words, specific enough to tell it apart from a similar term.
- No duplicate or near-duplicate terms.`;

// ---------- Validation ----------
const MAXLEN = { title: 120, bullet: 400, front: 300, back: 600, prompt: 600, option: 200, hint: 300, explanation: 600, topic: 40, body: 4000 };

// Safety net if LaTeX slips through: the app shows plain text, so turn common commands into symbols.
const GREEK: Record<string, string> = { alpha: "α", beta: "β", gamma: "γ", delta: "δ", theta: "θ", lambda: "λ", mu: "μ", pi: "π", sigma: "σ", rho: "ρ", Delta: "Δ", Sigma: "Σ" };
const SYMBOLS: [RegExp, string][] = [
  [/\\(ge|geq)\b/g, "≥"], [/\\(le|leq)\b/g, "≤"], [/\\neq?\b/g, "≠"], [/\\times\b/g, "×"], [/\\div\b/g, "÷"],
  [/\\cdot\b/g, "·"], [/\\pm\b/g, "±"], [/\\approx\b/g, "≈"], [/\\infty\b/g, "∞"], [/\\(to|rightarrow)\b/g, "→"],
];
const atom = (x: string) => (/^[\p{L}\p{N}.√²³\u0302\u0304]+$/u.test(x) || /^√\(.*\)$/.test(x) || /^\([^()]*\)$/.test(x) ? x : `(${x})`);

/** Read one {...} group starting at i (which points at "{"), honouring nesting. */
function group(s: string, i: number): [string, number] | null {
  if (s[i] !== "{") return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === "{") depth++;
    else if (s[j] === "}" && --depth === 0) return [s.slice(i + 1, j), j + 1];
  }
  return null;
}

/** Turn LaTeX into readable Unicode math, structurally, so nested fractions and roots stay correct. */
function convert(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; ) {
    const m = /^\\(frac|dfrac|tfrac|sqrt|hat|bar|text|mathrm|mathbf|left|right)/.exec(s.slice(i));
    if (!m) { out += s[i++]; continue; }
    let j = i + m[0].length;
    while (s[j] === " ") j++;
    const cmd = m[1];
    if (cmd === "left" || cmd === "right") { i = j; continue; }
    const a = group(s, j);
    if (!a) { out += m[0]; i = j; continue; }
    if (cmd.endsWith("frac")) {
      const b = group(s, a[1]);
      if (!b) { out += m[0]; i = j; continue; }
      out += `${atom(convert(a[0]))}/${atom(convert(b[0]))}`;
      i = b[1];
    } else if (cmd === "sqrt") { const r = convert(a[0]); out += /^[\p{L}\p{N}]+$/u.test(r) ? `√${r}` : `√(${r})`; i = a[1]; }
    else if (cmd === "hat") { out += convert(a[0]) + "\u0302"; i = a[1]; }
    else if (cmd === "bar") { out += convert(a[0]) + "\u0304"; i = a[1]; }
    else { out += convert(a[0]); i = a[1]; }
  }
  return out;
}

export function plainMath(s: string): string {
  if (!/[\\$]/.test(s)) return s;
  let out = s.replace(/\\[()\[\]]/g, "").replace(/\$\$?/g, "");
  out = out.replace(/\\(hat|bar)\s*([A-Za-z])\b/g, "\\$1{$2}");
  for (const [re, to] of SYMBOLS) out = out.replace(re, to);
  out = out.replace(/\\(alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|rho|Delta|Sigma)\b/g, (_, g) => GREEK[g]);
  out = convert(out);
  out = out.replace(/\^\{?2\}?/g, "²").replace(/\^\{?3\}?/g, "³").replace(/_\{([^{}]*)\}/g, "_$1").replace(/[{}]/g, "").replace(/\\/g, "");
  return out.normalize("NFC");
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

export function validSummary(out: SummaryOut): string {
  return typeof out.body === "string" ? plainMath(out.body.replace(/\u0000/g, "")).trim().slice(0, MAXLEN.body) : "";
}

export function validTerms(out: TermsOut, valid: Set<number>) {
  const seen = new Set<string>();
  return (out.terms ?? [])
    .map((t) => ({ term: cleanText(t.term, MAXLEN.title), definition: cleanText(t.definition, MAXLEN.explanation), pages: realPages(t.pages, valid) }))
    .filter((t) => {
      const key = t.term.toLowerCase();
      if (!t.term || !t.definition || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// ---------- Fact-check ----------
// Generated cards and questions are checked against the pages they cite before a student sees them:
// a citation that points at a page that does not actually support the claim gets dropped. Pure prompt,
// schema and bookkeeping here (so they run in unit tests); the LLM call itself is made by the caller,
// which already has an LLM client.
export const FACTCHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "supported", "quote"],
        properties: {
          index: { type: "integer" },
          supported: { type: "boolean" },
          quote: { type: "string" },
        },
      },
    },
  },
};
export type FactCheckOut = { results: { index: number; supported: boolean; quote: string }[] };

export function factCheckPrompt(word: string) {
  return `You check study material against the ${word}(s) it is said to come from, for a high school app.
For each numbered item below, decide whether the given ${word} text truly states or clearly shows the specific fact, definition, formula, rule or distinction that item tests, not just a related topic.
Reply with one result per item, by its index (0-based, in the order given):
- supported: true only when the claim is clearly backed by the given text; false if the text does not say it, contradicts it, or no text was given.
- quote: when supported, the exact sentence or short phrase from the given text that backs it, copied verbatim, nothing added or paraphrased. When not supported, an empty string.
Be strict: a plausible-sounding but unstated claim is not supported.`;
}

/** One block per item: its claim, and the text of the pages it cites (trimmed, so the call stays small). */
export function factCheckBlocks(items: { claim: string; pages: number[] }[], pageText: Map<number, string>, word: string) {
  return items
    .map((it, i) => {
      const text = it.pages.map((p) => pageText.get(p)).filter((t): t is string => !!t).join("\n\n").slice(0, 2000);
      return `Item ${i}:\nClaim: ${it.claim}\n${text ? `Cited ${word}(s):\n${text}` : "(no page cited)"}`;
    })
    .join("\n\n---\n\n");
}

/**
 * Drops items the fact-check is sure are unsupported, and attaches the supporting quote to the rest.
 * An item the model did not answer (a short or malformed reply) is kept, unquoted: this pass only
 * removes what it is confident about, so a flaky call never empties a whole study set.
 */
export function applyFactCheck<T>(items: T[], out: FactCheckOut): { item: T; quote: string | null }[] {
  const byIndex = new Map(out.results.map((r) => [r.index, r]));
  return items
    .map((item, i) => {
      const r = byIndex.get(i);
      if (r?.supported === false) return null;
      const quote = r && typeof r.quote === "string" ? cleanText(r.quote, 400) : "";
      return { item, quote: quote || null };
    })
    .filter((x): x is { item: T; quote: string | null } => x !== null);
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
