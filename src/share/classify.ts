import { detectImageType } from '../pdf/images';

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

export function classifyIncoming(bytes: Uint8Array): 'pdf' | 'image' | 'unsupported' {
  if (bytes.length >= PDF_MAGIC.length && PDF_MAGIC.every((b, i) => bytes[i] === b)) {
    return 'pdf';
  }
  try {
    detectImageType(bytes);
    return 'image';
  } catch {
    return 'unsupported';
  }
}
