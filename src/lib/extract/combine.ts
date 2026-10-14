// Several photos become one file: each becomes a full-page image in a new PDF, so the rest of the app
// (storage, the original-file viewer, page counts) treats it exactly like any other PDF upload.
import { PDFDocument } from "pdf-lib";

export async function photosToPdf(jpegs: Blob[]): Promise<Blob> {
  const doc = await PDFDocument.create();
  for (const jpeg of jpegs) {
    const bytes = new Uint8Array(await jpeg.arrayBuffer());
    const image = await doc.embedJpg(bytes);
    const page = doc.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }
  const bytes = await doc.save();
  return new Blob([bytes.slice().buffer], { type: "application/pdf" });
}
