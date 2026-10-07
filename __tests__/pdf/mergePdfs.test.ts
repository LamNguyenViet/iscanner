import { deflateSync } from 'zlib';
import {
  decodePDFRawStream,
  EncryptedPDFError,
  PDFDocument,
  PDFRawStream,
} from '../../src/pdf/pdfLib';
import { createPdfFromImages } from '../../src/pdf/createPdfFromImages';
import { getPdfPageCount, mergePdfs } from '../../src/pdf/mergePdfs';
import { PdfEncryptedError, PdfLoadError } from '../../src/errors/AppError';
import { makePng } from '../fixtures/images';
import { makePdfBomb } from '../fixtures/pdfBomb';
import { makePdfEncrypted } from '../fixtures/pdfEncrypted';

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

  it('rejects an encrypted pdf with PdfEncryptedError', async () => {
    const err = await getPdfPageCount(makePdfEncrypted(), 'e.pdf').catch((e) => e);
    expect(err).toBeInstanceOf(PdfEncryptedError);
    expect(err.fileName).toBe('e.pdf');
    expect(err.index).toBe(0);
  });

  it('maps the library EncryptedPDFError via instanceof', async () => {
    jest.spyOn(PDFDocument, 'load').mockRejectedValueOnce(new EncryptedPDFError());
    expect(await getPdfPageCount(A).catch((e) => e)).toBeInstanceOf(PdfEncryptedError);
  });

  it('garbage gives PdfLoadError with fileName', async () => {
    const err = await getPdfPageCount(new TextEncoder().encode('garbage'), 'g.pdf').catch((e) => e);
    expect(err).toBeInstanceOf(PdfLoadError);
    expect(err.fileName).toBe('g.pdf');
  });
});

describe('lazy load failures (Hermes)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('a page count that throws after a successful load is PDF_LOAD with the file name', async () => {
    jest.spyOn(PDFDocument, 'load').mockResolvedValueOnce({
      getPageCount: () => {
        throw new TypeError("Cannot read property 'Pages' of undefined");
      },
    } as unknown as PDFDocument);
    const err = await getPdfPageCount(new Uint8Array([1]), 'x.pdf').catch((e) => e);
    expect(err).toBeInstanceOf(PdfLoadError);
    expect(err.fileName).toBe('x.pdf');
  });

  it('copyPages failures become PdfLoadError with the source index', async () => {
    const A = await createPdfFromImages([img(10)]);
    jest.spyOn(PDFDocument.prototype, 'copyPages').mockRejectedValueOnce(new TypeError('boom'));
    const err = await mergePdfs([A]).catch((e) => e);
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
