import {
  AppError,
  FileReadError,
  PdfEncryptedError,
  PdfLoadError,
  PdfPasswordError,
  WordConvertError,
  withFileName,
} from '../errors/AppError';
import { convertWordToPdf, type WordDeps } from '../convert/convertWord';
import { getPdfPageCount, mergePdfs } from '../pdf/mergePdfs';
import type { DocumentMeta, LibraryStore } from '../library/types';
import type { ReadBytes } from './scanWorkflow';
import { withPasswordLoop, type AskPassword } from './passwordLoop';

export type PickedPdf = { uri: string; name: string; password?: string };
export type LoadedPdf = { uri: string; name: string; pageCount: number; password?: string };
export type { AskPassword };

/**
 * Page count of a PDF, asking for the password when it is encrypted. A password passed in is tried first
 * without asking. Resolves null when the user skips. Passwords are never logged.
 */
export async function openPdfWithPassword(
  bytes: Uint8Array,
  fileName: string,
  askPassword?: AskPassword,
  knownPassword?: string,
): Promise<{ pageCount: number; password?: string } | null> {
  const res = await withPasswordLoop((password) => getPdfPageCount(bytes, fileName, password), {
    fileName,
    ask: askPassword,
    known: knownPassword,
    needsPassword: (e) => e instanceof PdfEncryptedError,
    wrongPassword: (e) => e instanceof PdfPasswordError,
    event: 'pdf',
  });
  if (res === null) return null;
  return res.password === undefined ? { pageCount: res.value } : { pageCount: res.value, password: res.password };
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const CONTAINER_MAGICS = [
  [0x50, 0x4b, 0x03, 0x04], // ZIP (DOCX)
  [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], // CFB (DOC, protected Office)
];

const startsWith = (bytes: Uint8Array, magic: number[]) =>
  bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);

/** By content, never by name: a PDF stays a PDF; other ZIP/CFB containers go down the Word path. */
function isWordCandidate(bytes: Uint8Array): boolean {
  if (startsWith(bytes, PDF_MAGIC)) return false;
  return CONTAINER_MAGICS.some((m) => startsWith(bytes, m));
}

export type LoadDeps = {
  readBytes: ReadBytes;
  askPassword?: AskPassword;
  word?: Omit<WordDeps, 'readBytes' | 'askPassword'>;
};

export async function loadPickedFiles(
  deps: LoadDeps,
  files: PickedPdf[],
): Promise<{ loaded: LoadedPdf[]; failed: AppError[]; skipped: string[]; converted: string[] }> {
  const loaded: LoadedPdf[] = [];
  const failed: AppError[] = [];
  const skipped: string[] = [];
  const converted: string[] = [];
  for (const file of files) {
    let bytes: Uint8Array;
    try {
      bytes = await deps.readBytes(file.uri);
    } catch (cause) {
      failed.push(new FileReadError({ fileName: file.name, cause }));
      continue;
    }
    try {
      if (isWordCandidate(bytes)) {
        if (!deps.word) throw new WordConvertError({ fileName: file.name });
        const res = await convertWordToPdf(
          { ...deps.word, readBytes: deps.readBytes, askPassword: deps.askPassword },
          file,
        );
        if (res === null) skipped.push(file.name);
        else {
          converted.push(res.uri);
          loaded.push({ uri: res.uri, name: file.name, pageCount: res.pageCount });
        }
        continue;
      }
      const opened = await openPdfWithPassword(bytes, file.name, deps.askPassword, file.password);
      if (opened === null) skipped.push(file.name);
      else loaded.push({ uri: file.uri, name: file.name, ...opened });
    } catch (e) {
      failed.push(e instanceof AppError ? withFileName(e, file.name) : new PdfLoadError({ fileName: file.name, cause: e }));
    }
  }
  return { loaded, failed, skipped, converted };
}

/** PDF-only loading (no Word conversion). */
export function loadPickedPdfs(
  deps: { readBytes: ReadBytes; askPassword?: AskPassword },
  files: PickedPdf[],
) {
  return loadPickedFiles(deps, files);
}

export async function createMergedDocument(
  deps: { readBytes: ReadBytes; library: Pick<LibraryStore, 'add'> },
  files: LoadedPdf[],
  name: string,
): Promise<DocumentMeta> {
  const pdfs: Uint8Array[] = [];
  for (const file of files) pdfs.push(await deps.readBytes(file.uri));
  const merged = await mergePdfs(
    pdfs,
    files.map((f) => f.password),
  );
  const pageCount = files.reduce((sum, f) => sum + f.pageCount, 0);
  return deps.library.add(merged, { name, pageCount, source: 'merge' });
}
