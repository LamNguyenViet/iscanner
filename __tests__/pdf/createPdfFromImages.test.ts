import { PDFDocument } from 'pdf-lib';
import { detectImageType } from '../../src/pdf/images';
import { createPdfFromImages } from '../../src/pdf/createPdfFromImages';
import { makeJpeg, makePng } from '../fixtures/images';

describe('createPdfFromImages', () => {
  it('detects jpeg and png', () => {
    expect(detectImageType(makeJpeg(4, 4))).toBe('image/jpeg');
    expect(detectImageType(makePng(4, 4))).toBe('image/png');
    expect(() => detectImageType(new Uint8Array([1, 2, 3, 4]))).toThrow('UNSUPPORTED_IMAGE');
  });

  it('one page per image sized to pixels', async () => {
    const bytes = await createPdfFromImages([
      { bytes: makeJpeg(40, 60), mimeType: 'image/jpeg' },
      { bytes: makePng(30, 20), mimeType: 'image/png' },
    ]);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize()).toEqual({ width: 40, height: 60 });
    expect(doc.getPage(1).getSize()).toEqual({ width: 30, height: 20 });
  });

  it('throws on empty list', async () => {
    await expect(createPdfFromImages([])).rejects.toThrow('NO_IMAGES');
  });
});
