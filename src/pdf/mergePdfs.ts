import { PdfEncryptedError, PdfLoadError } from '../errors/AppError';
import { EncryptedPDFError, PDFDocument } from './pdfLib';

// Hermes loads a broken file lazily and only fails on the first read, so the load is not done until the
// page list has been read too.
async function loadPdf(
  bytes: Uint8Array,
  index: number,
  fileName?: string,
): Promise<{ doc: PDFDocument; pageCount: number; pageIndices: number[] }> {
  try {
    const doc = await PDFDocument.load(bytes);
    return { doc, pageCount: doc.getPageCount(), pageIndices: doc.getPageIndices() };
  } catch (cause) {
    if (cause instanceof EncryptedPDFError) throw new PdfEncryptedError({ index, fileName, cause });
    throw new PdfLoadError({ index, fileName, cause });
  }
}

export async function getPdfPageCount(pdf: Uint8Array, fileName?: string): Promise<number> {
  return (await loadPdf(pdf, 0, fileName)).pageCount;
}

export async function mergePdfs(pdfs: Uint8Array[]): Promise<Uint8Array> {
  if (pdfs.length === 0) throw new Error('NO_PDFS');
  const out = await PDFDocument.create();
  for (let i = 0; i < pdfs.length; i++) {
    const { doc, pageIndices } = await loadPdf(pdfs[i], i);
    let pages;
    try {
      pages = await out.copyPages(doc, pageIndices);
    } catch (cause) {
      throw new PdfLoadError({ index: i, cause });
    }
    pages.forEach((p) => out.addPage(p));
  }
  return out.save();
}
