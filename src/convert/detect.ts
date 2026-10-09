import * as CFB from 'cfb';
import type { WordKind } from './types';

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const DOCX_ENTRY = 'word/document.xml';

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);
}

/**
 * True when the ZIP central directory lists `word/document.xml`. Reads only the directory
 * (synchronously) instead of inflating the archive.
 */
function zipHasDocumentXml(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End of central directory record: 22 bytes + up to 65535 bytes of comment.
  const minEocd = Math.max(0, bytes.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= minEocd; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return false;
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) return false;
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    if (p + 46 + nameLen > bytes.length) return false;
    let name = '';
    for (let i = 0; i < nameLen; i++) name += String.fromCharCode(bytes[p + 46 + i]);
    if (name === DOCX_ENTRY) return true;
    p += 46 + nameLen + extraLen + commentLen;
  }
  return false;
}

/** Identifies a Word file by its content, never by its name. Null when it is not Word. */
export function detectWordKind(bytes: Uint8Array): WordKind | null {
  try {
    if (startsWith(bytes, ZIP_MAGIC)) {
      return zipHasDocumentXml(bytes) ? 'docx' : null;
    }
    if (startsWith(bytes, CFB_MAGIC)) {
      const cfb = CFB.read(bytes, { type: 'array' });
      if (CFB.find(cfb, '/EncryptedPackage')) return 'docx-encrypted';
      if (CFB.find(cfb, '/WordDocument')) return 'doc';
    }
  } catch {
    return null;
  }
  return null;
}
