import { createPdfFromImages, type PageImage } from '../pdf/createPdfFromImages';
import { detectImageType } from '../pdf/images';
import type { Align, PageLayout } from '../pdf/layout';
import type { DocumentMeta, LibraryStore } from '../library/types';

export type ReadBytes = (uri: string) => Promise<Uint8Array>;

export async function createScanDocument(
  deps: { readBytes: ReadBytes; library: Pick<LibraryStore, 'add'> },
  pages: { uri: string; align: Align }[],
  name: string,
  layout: PageLayout,
): Promise<DocumentMeta> {
  if (pages.length === 0) throw new Error('NO_IMAGES');
  const images: PageImage[] = [];
  for (const page of pages) {
    const bytes = await deps.readBytes(page.uri);
    images.push({ bytes, mimeType: detectImageType(bytes), align: page.align });
  }
  const pdf = await createPdfFromImages(images, layout);
  return deps.library.add(pdf, { name, pageCount: pages.length, source: 'scan' });
}
