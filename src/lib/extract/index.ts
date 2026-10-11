// Text extraction runs on the student's device, so a file that cannot be read never reaches the
// server and never counts against their uploads. PDFs keep real page numbers for citations; Word
// files and pasted text are split into numbered parts.

export type SourceKind = "pdf" | "docx" | "text";
export type ExtractedPage = { page: number; text: string };
export type Extracted = { kind: SourceKind; pages: ExtractedPage[]; totalPages: number; skippedPages: number };

export type ExtractErrorCode =
  | "password" | "scanned" | "empty" | "too_large" | "too_many_pages" | "unsupported" | "legacy_doc" | "damaged";

export class ExtractError extends Error {
  constructor(public code: ExtractErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ExtractError";
  }
}

export const MAX_BYTES = 25 * 1024 * 1024;
export const MAX_PAGES = 400;
export const MAX_PAGE_CHARS = 60_000;
export const PART_CHARS = 3_000;
const MIN_PAGE_CHARS = 3;
const SCANNED_CHARS_PER_PAGE = 25;

export function kindOf(file: { name: string; type: string }): SourceKind | "legacy_doc" | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (name.endsWith(".doc") || file.type === "application/msword") return "legacy_doc";
  if (/\.(txt|md|markdown)$/.test(name) || file.type === "text/plain" || file.type === "text/markdown") return "text";
  return null;
}

/** Tidy extracted text: join hyphenated line breaks, collapse runs of spaces, keep paragraph breaks. */
export function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/­/g, "")
    .replace(/([a-z])-\n([a-z])/g, "$1$2")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Split long text into parts of about `size` characters, breaking between paragraphs, then sentences. */
export function splitIntoParts(text: string, size = PART_CHARS): string[] {
  const clean = tidy(text);
  if (!clean) return [];
  const paragraphs = clean.split(/\n{2,}/);
  const parts: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) parts.push(current.trim());
    current = "";
  };
  for (const p of paragraphs) {
    if (p.length > size) {
      push();
      let rest = p;
      while (rest.length > size) {
        const window = rest.slice(0, size);
        const cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("\n"));
        const at = cut > size * 0.5 ? cut + 1 : size;
        parts.push(rest.slice(0, at).trim());
        rest = rest.slice(at);
      }
      current = rest;
      continue;
    }
    if (current && current.length + p.length + 2 > size) push();
    current = current ? `${current}\n\n${p}` : p;
  }
  push();
  return parts;
}

function asParts(kind: SourceKind, text: string): Extracted {
  const parts = splitIntoParts(text);
  if (parts.length === 0) throw new ExtractError("empty");
  if (parts.length > MAX_PAGES) throw new ExtractError("too_many_pages");
  return { kind, pages: parts.map((t, i) => ({ page: i + 1, text: t })), totalPages: parts.length, skippedPages: 0 };
}

/** Decide what a PDF's per-page text means: usable, scanned images, or empty. */
export function assemblePdf(pageTexts: string[]): Extracted {
  const total = pageTexts.length;
  if (total === 0) throw new ExtractError("empty");
  const pages = pageTexts
    .map((t, i) => ({ page: i + 1, text: tidy(t).slice(0, MAX_PAGE_CHARS) }))
    .filter((p) => p.text.length >= MIN_PAGE_CHARS);
  const chars = pages.reduce((n, p) => n + p.text.length, 0);
  if (chars / total < SCANNED_CHARS_PER_PAGE) throw new ExtractError(chars === 0 && total === 1 ? "empty" : "scanned");
  return { kind: "pdf", pages, totalPages: total, skippedPages: total - pages.length };
}

export async function extractFile(file: File, onProgress?: (done: number, total: number) => void): Promise<Extracted> {
  const kind = kindOf(file);
  if (kind === "legacy_doc") throw new ExtractError("legacy_doc");
  if (!kind) throw new ExtractError("unsupported");
  if (file.size > MAX_BYTES) throw new ExtractError("too_large");
  if (file.size === 0) throw new ExtractError("empty");

  if (kind === "text") return asParts("text", await file.text());
  if (kind === "docx") {
    const mammoth = await import("mammoth");
    try {
      const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return asParts("docx", value);
    } catch (e) {
      if (e instanceof ExtractError) throw e;
      throw new ExtractError("damaged");
    }
  }

  const { readPdf } = await import("./pdf");
  return assemblePdf(await readPdf(await file.arrayBuffer(), onProgress));
}

export function extractPasted(text: string): Extracted {
  return asParts("text", text);
}
