import { PDFDocument } from 'pdf-lib';
import type { ImageInput } from './images';

export async function createPdfFromImages(images: ImageInput[]): Promise<Uint8Array> {
  if (images.length === 0) throw new Error('NO_IMAGES');
  const doc = await PDFDocument.create();
  for (const input of images) {
    const img =
      input.mimeType === 'image/png'
        ? await doc.embedPng(input.bytes)
        : await doc.embedJpg(input.bytes);
    const page = doc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  return doc.save();
}
