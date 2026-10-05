import { createPdfFromImages } from '../pdf/createPdfFromImages';
import { detectImageType, type ImageInput } from '../pdf/images';
import type { DocumentMeta, LibraryStore } from '../library/types';

export type ReadBytes = (uri: string) => Promise<Uint8Array>;

export async function createScanDocument(
  deps: { readBytes: ReadBytes; library: Pick<LibraryStore, 'add'> },
  imageUris: string[],
  name: string,
): Promise<DocumentMeta> {
  if (imageUris.length === 0) throw new Error('NO_IMAGES');
  const images: ImageInput[] = [];
  for (const uri of imageUris) {
    const bytes = await deps.readBytes(uri);
    images.push({ bytes, mimeType: detectImageType(bytes) });
  }
  const pdf = await createPdfFromImages(images);
  return deps.library.add(pdf, { name, pageCount: imageUris.length, source: 'scan' });
}
