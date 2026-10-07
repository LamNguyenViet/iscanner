import { deflateSync } from 'zlib';
import {
  decodePDFRawStream,
  EncryptedPDFError,
  PDFDocument,
  PDFRawStream,
} from '../../src/pdf/pdfLib';
import { createPdfFromImages } from '../../src/pdf/createPdfFromImages';
import { getPdfPageCount, mergePdfs, PdfLoadError } from '../../src/pdf/mergePdfs';
import { makePng } from '../fixtures/images';
import { makePdfBomb } from '../fixtures/pdfBomb';

const img = (n: number) => ({ bytes: makePng(n, n), mimeType: 'image/png' as const, align: 'center' as const });

async function widths(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => p.getSize().width);
}

describe('mergePdfs', () => {
  let A: Uint8Array;
  let B: Uint8Array;
  beforeAll(async () => {
    A = await createPdfFromImages([img(10)]);
    B = await createPdfFromImages([img(20), img(30)]);
  });
  afterEach(() => jest.restoreAllMocks());

  it('merges in order', async () => {
    expect(await widths(await mergePdfs([A, B]))).toEqual([10, 20, 30]);
    expect(await widths(await mergePdfs([B, A]))).toEqual([20, 30, 10]);
  });

  it('merges duplicates', async () => {
    expect(await widths(await mergePdfs([A, A]))).toHaveLength(2);
  });

  it('counts pages', async () => {
    expect(await getPdfPageCount(B)).toBe(2);
  });

  it('throws on empty list', async () => {
    await expect(mergePdfs([])).rejects.toThrow('NO_PDFS');
  });

  it('reports failing index', async () => {
    const err = await mergePdfs([A, new TextEncoder().encode('garbage')]).catch((e) => e);
    expect(err).toBeInstanceOf(PdfLoadError);
    expect(err.index).toBe(1);
  });

  it('rejects encrypted pdf', async () => {
    jest.spyOn(PDFDocument, 'load').mockRejectedValueOnce(new EncryptedPDFError());
    const err = await getPdfPageCount(A).catch((e) => e);
    expect(err).toBeInstanceOf(PdfLoadError);
    expect(err.index).toBe(0);
  });
});

describe('decompression bomb (untrusted shared PDFs)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('refuses to inflate a crafted stream past the size cap', async () => {
    const doc = await PDFDocument.create();
    const compressed = deflateSync(Buffer.alloc(150 * 1024 * 1024, 0x20), { level: 9 });
    const stream = PDFRawStream.of(
      doc.context.obj({ Filter: 'FlateDecode', Length: compressed.length }),
      new Uint8Array(compressed),
    );
    expect(() => decodePDFRawStream(stream).decode()).toThrow(/Decompression bomb/);
  });

  it('a PDF carrying such a stream still loads without it', async () => {
    // The library warns about the object it had to skip.
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await getPdfPageCount(makePdfBomb(150))).toBe(0);
  });
});
