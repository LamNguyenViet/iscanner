import { PdfEncryptedError, PdfLoadError, PdfPasswordError } from '../errors/AppError';
import { EncryptedPDFError, PDFDocument } from './pdfLib';

// Hermes loads a broken file lazily and only fails on the first read, so the load is not done until the
// page list has been read too.
async function loadPdf(
  bytes: Uint8Array,
  index: number,
  fileName?: string,
  password?: string,
): Promise<{ doc: PDFDocument; pageCount: number; pageIndices: number[] }> {
  try {
    const doc = await PDFDocument.load(bytes, password === undefined ? undefined : { password });
    return { doc, pageCount: doc.getPageCount(), pageIndices: doc.getPageIndices() };
  } catch (cause) {
    if (cause instanceof EncryptedPDFError) throw new PdfEncryptedError({ index, fileName, cause });
    // The password is never put in the error: only the library's own error is kept as the cause.
    if (password !== undefined && cause instanceof Error && /password incorrect/i.test(cause.message)) {
      throw new PdfPasswordError({ index, fileName, cause });
    }
    throw new PdfLoadError({ index, fileName, cause });
  }
}

export async function getPdfPageCount(pdf: Uint8Array, fileName?: string, password?: string): Promise<number> {
  return (await loadPdf(pdf, 0, fileName, password)).pageCount;
}

export async function mergePdfs(pdfs: Uint8Array[], passwords?: (string | undefined)[]): Promise<Uint8Array> {
  if (pdfs.length === 0) throw new Error('NO_PDFS');
  const out = await PDFDocument.create();
  for (let i = 0; i < pdfs.length; i++) {
    const { doc, pageIndices } = await loadPdf(pdfs[i], i, undefined, passwords?.[i]);
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

/** A copy of a password-protected PDF without the password (the saved file has no /Encrypt). */
export async function unlockPdf(bytes: Uint8Array, password: string, fileName?: string): Promise<Uint8Array> {
  const { doc } = await loadPdf(bytes, 0, fileName, password);
  return doc.save();
}
