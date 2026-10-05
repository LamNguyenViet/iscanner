import { PDFDocument } from 'pdf-lib';

export class PdfLoadError extends Error {
  index: number;
  constructor(index: number) {
    super('PDF_LOAD_FAILED');
    this.name = 'PdfLoadError';
    this.index = index;
    Object.setPrototypeOf(this, PdfLoadError.prototype);
  }
}

async function loadPdf(bytes: Uint8Array, index: number): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes);
  } catch {
    throw new PdfLoadError(index);
  }
}

export async function getPdfPageCount(pdf: Uint8Array): Promise<number> {
  return (await loadPdf(pdf, 0)).getPageCount();
}

export async function mergePdfs(pdfs: Uint8Array[]): Promise<Uint8Array> {
  if (pdfs.length === 0) throw new Error('NO_PDFS');
  const out = await PDFDocument.create();
  for (let i = 0; i < pdfs.length; i++) {
    const src = await loadPdf(pdfs[i], i);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return out.save();
}
