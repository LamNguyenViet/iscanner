import { Directory, File, Paths } from 'expo-file-system';
import { log } from '../logging/logger';
import { classifyIncoming } from './classify';
import { displayNameFromUri } from './displayName';
import { isIosInboxFile } from './inbox';
import { FileReadError, FileTooLargeError, UnsupportedFileError, type AppError } from '../errors/AppError';
import type { IncomingFile } from './types';

export const MAX_INCOMING_BYTES = 100 * 1024 * 1024;

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function displayName(source: { uri: string; name?: string }): string {
  return source.name || displayNameFromUri(source.uri);
}

function extensionFor(bytes: Uint8Array, kind: 'pdf' | 'image'): string {
  if (kind === 'pdf') return 'pdf';
  return bytes[0] === 0x89 ? 'png' : 'jpg';
}

function discard(file: File | undefined): void {
  try {
    file?.delete();
  } catch (e) {
    log.warn('could not delete an imported or partial file', { cause: e });
    // already gone — ignore
  }
}

/**
 * Copy each shared source (content:// or file://) into cache/incoming right away — shared URI grants
 * can expire — checking size and type. A bad source is skipped, never thrown. An imported iOS
 * Documents/Inbox source is then deleted (best-effort).
 */
export async function importIncoming(
  sources: { uri: string; name?: string }[],
): Promise<{ files: IncomingFile[]; skipped: AppError[] }> {
  const files: IncomingFile[] = [];
  const skipped: AppError[] = [];
  for (const source of sources) {
    const name = displayName(source);
    let copy: File | undefined;
    try {
      const src = new File(source.uri);
      let declared: number | null = null;
      try {
        declared = src.size;
      } catch {
        // size unavailable for some providers — fall back to the byte length
      }
      if (typeof declared === 'number' && declared > MAX_INCOMING_BYTES) {
        skipped.push(new FileTooLargeError({ fileName: name }));
        continue;
      }
      const bytes = await src.bytes();
      if (bytes.length > MAX_INCOMING_BYTES) {
        skipped.push(new FileTooLargeError({ fileName: name }));
        continue;
      }
      const kind = classifyIncoming(bytes);
      if (kind === 'unsupported') {
        skipped.push(new UnsupportedFileError({ fileName: name }));
        continue;
      }
      const dir = new Directory(Paths.cache, 'incoming');
      dir.create({ intermediates: true, idempotent: true });
      copy = new File(dir, `${newId()}.${extensionFor(bytes, kind)}`);
      copy.create({ intermediates: true, overwrite: true });
      copy.write(bytes);
      files.push({ uri: copy.uri, name, kind, size: bytes.length });
      if (isIosInboxFile(source.uri)) discard(src);
    } catch (cause) {
      discard(copy);
      skipped.push(new FileReadError({ fileName: name, cause }));
    }
  }
  return { files, skipped };
}
