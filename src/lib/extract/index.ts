// Text extraction runs on the student's device, so a file that cannot be read never reaches the
// server and never counts against their uploads. PDFs keep real page numbers for citations; Word
// files and pasted text are split into numbered parts. Pages with no text (scans) and photos of notes
// are rendered to images here and read by the AI (`readPage`), one page at a time.

export type SourceKind = "pdf" | "docx" | "text" | "image";
export type ExtractedPage = { page: number; text: string };
export type Extracted = {
  kind: SourceKind;
  pages: ExtractedPage[];
  totalPages: number;
  skippedPages: number;
  /** Pages that were read from images (scans or a photo). */
  scannedPages?: number;
  /** For a photo: the upright, shrunk JPEG, stored instead of the original. */
  upload?: Blob;
};

export type ExtractErrorCode =
  | "password" | "scanned" | "empty" | "too_large" | "too_many_pages" | "unsupported" | "legacy_doc" | "damaged"
  | "too_many_scanned" | "scan_limit" | "scan_failed" | "photo_unreadable";

/** Reads one page image (a data URL) and returns its text. Throws ExtractError for limits and failures. */
export type PageReader = (dataUrl: string) => Promise<string>;
export type ExtractStage = "text" | "scan";

export class ExtractError extends Error {
  constructor(public code: ExtractErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ExtractError";
  }
}

export const MAX_BYTES = 25 * 1024 * 1024;
export const MAX_PAGES = 400;
/** Most scanned pages read in one upload (each one is an AI call). */
export const MAX_SCAN_PAGES = 60;
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
  if (/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || /\.(jpe?g|png|webp|heic|heif)$/.test(name)) return "image";
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

export async function extractFile(file: File, onProgress?: (done: number, total: number, stage: ExtractStage) => void, readPage?: PageReader): Promise<Extracted> {
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

  if (kind === "image") {
    if (!readPage) throw new ExtractError("unsupported");
    const { photoToJpeg, blobToDataUrl } = await import("./image");
    let jpeg: Blob;
    try {
      jpeg = await photoToJpeg(file);
    } catch {
      throw new ExtractError("photo_unreadable");
    }
    onProgress?.(0, 1, "scan");
    const text = tidy(await readPage(await blobToDataUrl(jpeg))).slice(0, MAX_PAGE_CHARS);
    onProgress?.(1, 1, "scan");
    if (text.length < MIN_PAGE_CHARS) throw new ExtractError("empty");
    return { kind: "image", pages: [{ page: 1, text }], totalPages: 1, skippedPages: 0, scannedPages: 1, upload: jpeg };
  }

  // pdf.js takes ownership of the bytes it is given, so each pass gets its own copy.
  const bytes = await file.arrayBuffer();
  const { readPdf, scanPdfPages } = await import("./pdf");
  const texts = await readPdf(bytes.slice(0), (d, t) => onProgress?.(d, t, "text"));
  try {
    return assemblePdf(texts);
  } catch (e) {
    if (!(e instanceof ExtractError) || e.code !== "scanned" || !readPage) throw e;
  }
  // A scan: read the pages that have no text from their images.
  const blank = texts.flatMap((t, i) => (tidy(t).length < MIN_PAGE_CHARS ? [i + 1] : []));
  if (blank.length > MAX_SCAN_PAGES) throw new ExtractError("too_many_scanned");
  onProgress?.(0, blank.length, "scan");
  const read = await scanPdfPages(bytes.slice(0), blank, readPage, (d, t) => onProgress?.(d, t, "scan"));
  try {
    return { ...assemblePdf(texts.map((t, i) => read.get(i + 1) ?? t)), scannedPages: blank.length };
  } catch (e) {
    throw e instanceof ExtractError && e.code === "scanned" ? new ExtractError("empty") : e;
  }
}

export function extractPasted(text: string): Extracted {
  return asParts("text", text);
}
