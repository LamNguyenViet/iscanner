import { PdfEncryptedError, PdfLoadError } from '../errors/AppError';
import { EncryptedPDFError, PDFDocument } from './pdfLib';

async function loadPdf(bytes: Uint8Array, index: number, fileName?: string): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes);
  } catch (cause) {
    if (cause instanceof EncryptedPDFError) throw new PdfEncryptedError({ index, fileName, cause });
    throw new PdfLoadError({ index, fileName, cause });
  }
}

export async function getPdfPageCount(pdf: Uint8Array, fileName?: string): Promise<number> {
  return (await loadPdf(pdf, 0, fileName)).getPageCount();
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
