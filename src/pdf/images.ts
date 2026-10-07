import { ImageProcessError } from '../errors/AppError';

export type ImageMime = 'image/jpeg' | 'image/png';
export type ImageInput = { bytes: Uint8Array; mimeType: ImageMime };

export function detectImageType(bytes: Uint8Array): ImageMime {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) {
    return 'image/png';
  }
  throw new ImageProcessError();
}
