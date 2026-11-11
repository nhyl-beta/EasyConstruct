import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const WIDTH_PX = 480;
// shortcut: the whole file is read into memory to draw page 1, so bigger PDFs get no thumbnail; upgrade by rendering on the server.
const MAX_BYTES = 100 * 1024 * 1024;

/** Page 1 of a PDF as a small JPEG data URL, or null when it cannot be drawn (too big, damaged, locked). */
export async function pdfThumbnail(file: File): Promise<string | null> {
  if (file.size > MAX_BYTES) return null;
  try {
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: WIDTH_PX / page.getViewport({ scale: 1 }).width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; // a PDF page is transparent; JPEG would turn that black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    await doc.destroy();
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}
