import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ExtractError, MAX_PAGES } from "./index";

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
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str + (item.hasEOL ? "\n" : "");
      }
      texts.push(text);
      page.cleanup();
      onProgress?.(n, doc.numPages);
    }
    return texts;
  } finally {
    await task.destroy();
  }
}
