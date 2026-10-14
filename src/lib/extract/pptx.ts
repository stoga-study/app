// PowerPoint (.pptx, also what Google Slides exports): each slide becomes a page, in presentation
// order, with its speaker notes after the slide text. The XML parsing is plain string work, so it runs
// in unit tests without a DOM; only `readPptx` needs the zip library.

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e] ?? m,
  );

/** The text of one slide or notes part: one line per paragraph, fields (like the slide number) dropped. */
export function partText(xml: string): string {
  const lines: string[] = [];
  // Empty self-closing paragraphs first, or the next match would swallow them into a real one.
  const clean = xml.replace(/<a:p\b[^>]*\/>/g, "");
  for (const [, para] of clean.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)) {
    const body = para.replace(/<a:fld\b[\s\S]*?<\/a:fld>/g, "").replace(/<a:br\b[^>]*\/>/g, "<a:t>\n</a:t>");
    const text = [...body.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)].map((m) => decode(m[1])).join("").trim();
    if (text) lines.push(text);
  }
  return lines.join("\n");
}

/** Relationship id → target path, from a .rels file (targets made absolute within the zip). */
export function relTargets(relsXml: string, baseDir: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [tag] of relsXml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(tag)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(tag)?.[1];
    if (!id || !target) continue;
    out.set(id, resolve(baseDir, target));
  }
  return out;
}

function resolve(baseDir: string, target: string) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = baseDir.split("/").filter(Boolean);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

/** Slide paths in the order they are shown, from presentation.xml and its rels. */
export function slideOrder(presentationXml: string, presentationRels: string): string[] {
  const targets = relTargets(presentationRels, "ppt");
  const ids = [...presentationXml.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)].map((m) => m[1]);
  return ids.map((id) => targets.get(id)).filter((t): t is string => !!t);
}

/** A slide's page text: the slide itself, then its speaker notes when there are any. */
export function slidePage(slideText: string, notesText: string): string {
  const s = slideText.trim(), n = notesText.trim();
  return n ? `${s}${s ? "\n\n" : ""}Speaker notes:\n${n}` : s;
}

/** Each slide's text (with notes), in order. Hidden slides are kept: they are still part of the deck. */
export async function readPptx(data: ArrayBuffer): Promise<string[]> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(data);
  const read = (path: string) => zip.file(path)?.async("string") ?? Promise.resolve("");
  const order = slideOrder(await read("ppt/presentation.xml"), await read("ppt/_rels/presentation.xml.rels"));
  const pages: string[] = [];
  for (const slidePath of order) {
    const dir = slidePath.slice(0, slidePath.lastIndexOf("/"));
    const name = slidePath.slice(slidePath.lastIndexOf("/") + 1);
    const rels = relTargets(await read(`${dir}/_rels/${name}.rels`), dir);
    const notesPath = [...rels.values()].find((t) => /notesSlides\/notesSlide\d+\.xml$/.test(t));
    pages.push(slidePage(partText(await read(slidePath)), notesPath ? partText(await read(notesPath)) : ""));
  }
  return pages;
}
