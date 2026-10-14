import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ExtractError, MAX_PAGES } from "./index";
import { reconstructPage, type TextItem } from "./layout";

GlobalWorkerOptions.workerSrc = workerUrl;

/** Text of each page, in order. Loaded on demand: pdf.js is large and only needed for uploads. */
export async function readPdf(data: ArrayBuffer, onProgress?: (done: number, total: number) => void): Promise<string[]> {
  const task = getDocument({ data: new Uint8Array(data) });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    await task.destroy();
    const name = (e as { name?: string })?.name;
    if (name === "PasswordException") throw new ExtractError("password");
    throw new ExtractError("damaged");
  }
  try {
    if (doc.numPages > MAX_PAGES) throw new ExtractError("too_many_pages");
    const texts: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items: TextItem[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        items.push({ str: item.str, x: item.transform[4], y: item.transform[5], height: item.height || Math.abs(item.transform[3]) || 10, hasEOL: item.hasEOL });
      }
      texts.push(reconstructPage(items, page.view[2] - page.view[0]));
      page.cleanup();
      onProgress?.(n, doc.numPages);
    }
    return texts;
  } finally {
    await task.destroy();
  }
}

/** Renders one page of a PDF at a signed URL onto a canvas, for the original-file viewer. */
export async function renderPdfPageFromUrl(url: string, pageNo: number, canvas: HTMLCanvasElement, maxWidth: number): Promise<void> {
  const task = getDocument({ url });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(Math.min(Math.max(1, pageNo), doc.numPages));
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.5, (maxWidth * (window.devicePixelRatio || 1)) / base.width);
    const viewport = page.getViewport({ scale });
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    page.cleanup();
  } finally {
    await task.destroy();
  }
}

/**
 * Read pages that have no text (a scan) by rendering each one to an image and sending it to `readPage`.
 * Up to three pages are read at once. Returns page number → text.
 */
export async function scanPdfPages(
  data: ArrayBuffer,
  pageNumbers: number[],
  readPage: (dataUrl: string) => Promise<string>,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<number, string>> {
  const { pdfPageToJpeg, blobToDataUrl } = await import("./image");
  const task = getDocument({ data: new Uint8Array(data) });
  const out = new Map<number, string>();
  const inFlight = new Set<Promise<void>>();
  let done = 0;
  let failure: unknown = null;
  try {
    const doc = await task.promise;
    for (const n of pageNumbers) {
      if (failure) break;
      const page = await doc.getPage(n);
      const jpeg = await pdfPageToJpeg(page as never);
      page.cleanup();
      const url = await blobToDataUrl(jpeg);
      const job = readPage(url)
        .then((text) => { out.set(n, text); onProgress?.(++done, pageNumbers.length); })
        .catch((e) => { failure ??= e; })
        .finally(() => inFlight.delete(job));
      inFlight.add(job);
      if (inFlight.size >= 3) await Promise.race(inFlight);
    }
    await Promise.all(inFlight);
    if (failure) throw failure;
    return out;
  } finally {
    await task.destroy();
  }
}
