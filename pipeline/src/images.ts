// Uploaded floor plans -> PNGs the model can read. Images are scaled so the long edge is at most MAX px.
// PDFs (usually whole drawing sets) are searched for the floor plan sheet by their text, and pages can be
// rendered cropped to just the plan drawing, so the model sees it at a useful resolution.
import { createCanvas, loadImage } from '@napi-rs/canvas';

const MAX = 2000;

export interface PlanImage { png: Buffer; width: number; height: number; page?: number }
export type Box = [number, number, number, number]; // left, top, right, bottom as fractions of the page

export const isPdf = (data: Buffer) => data.subarray(0, 5).toString('latin1') === '%PDF-';

export async function imageToPlan(data: Buffer): Promise<PlanImage> {
  const img = await loadImage(data);
  const k = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.round(img.width * k), h = Math.round(img.height * k);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // transparent plans become white, like paper
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return { png: canvas.toBuffer('image/png'), width: w, height: h };
}

async function openPdf(data: Buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs.getDocument({ data: new Uint8Array(data), verbosity: 0 }).promise;
}

// How much each page looks like a floor plan, from its text: sheet titles, room labels with sizes
// ("BEDROOM #1 (10'-8" x 12'-0")"), minus words from electrical, foundation, roof, elevation and section sheets.
export async function scorePdfPages(data: Buffer) {
  const doc = await openPdf(data);
  try {
    const pages: { page: number; score: number }[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const items = (await (await doc.getPage(i)).getTextContent()).items as { str?: string }[];
      const t = items.map(x => x.str ?? '').join(' ').replace(/\s+/g, ' ').toUpperCase();
      const n = (re: RegExp) => (t.match(re) ?? []).length;
      const score = 3 * n(/FLOOR PLAN/g)
        + 4 * n(/(BEDROOM|KITCHEN|LIVING|DINING|BATH|FAMILY|GREAT ROOM|DEN|OFFICE|LAUNDRY|GARAGE|CLOSET)[^()]{0,30}\(\s*\d+'\s*-?\s*\d*"?\s*X\s*\d+'/g)
        + n(/\b(BEDROOM|KITCHEN|LIVING ROOM|DINING|BATH|LAUNDRY|CLOSET|GARAGE)\b/g)
        - 2 * n(/ELECTRICAL|OUTLET|SWITCH|LIGHTING|SMOKE|GFCI/g) - 2 * n(/FOUNDATION|FOOTING|ANCHOR BOLT/g)
        - n(/ROOF|TRUSS|RAFTER/g) - 2 * n(/ELEVATION/g) - 2 * n(/SECTION [A-Z]-[A-Z]/g);
      pages.push({ page: i, score });
    }
    return pages;
  } finally {
    await doc.cleanup();
  }
}

// Render one page (optionally just the `crop` box of it) with the long edge at `max` px.
export async function renderPdfPage(data: Buffer, page: number, max = MAX, crop: Box = [0, 0, 1, 1]): Promise<PlanImage> {
  const doc = await openPdf(data);
  try {
    const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
    const base = p.getViewport({ scale: 1 });
    const cw = (crop[2] - crop[0]) * base.width, ch = (crop[3] - crop[1]) * base.height;
    const viewport = p.getViewport({ scale: max / Math.max(cw, ch) });
    const w = Math.round((crop[2] - crop[0]) * viewport.width), h = Math.round((crop[3] - crop[1]) * viewport.height);
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    await p.render({
      canvas: canvas as unknown as HTMLCanvasElement, canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport,
      transform: [1, 0, 0, 1, -crop[0] * viewport.width, -crop[1] * viewport.height],
    }).promise;
    return { png: canvas.toBuffer('image/png'), width: w, height: h, page };
  } finally {
    await doc.cleanup();
  }
}
