import { PDFDocument } from './pdfLib';
import type { ImageInput } from './images';
import { computePlacement, type Align, type PageLayout } from './layout';

export type PageImage = ImageInput & { align: Align };

const IMAGE_LAYOUT: PageLayout = { pageSize: 'image', margin: 'none' };

export async function createPdfFromImages(
  images: PageImage[],
  layout: PageLayout = IMAGE_LAYOUT,
): Promise<Uint8Array> {
  if (images.length === 0) throw new Error('NO_IMAGES');
  const doc = await PDFDocument.create();
  for (const input of images) {
    const img =
      input.mimeType === 'image/png'
        ? await doc.embedPng(input.bytes)
        : await doc.embedJpg(input.bytes);
    const { pageWidth, pageHeight, x, y, width, height } = computePlacement(
      { width: img.width, height: img.height },
      layout,
      input.align,
    );
    const page = doc.addPage([pageWidth, pageHeight]);
    page.drawImage(img, { x, y, width, height });
  }
  return doc.save();
}
