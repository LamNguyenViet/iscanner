import {
  AppError,
  FileReadError,
  PdfEncryptedError,
  PdfLoadError,
  PdfPasswordError,
  withFileName,
} from '../errors/AppError';
import { log } from '../logging/logger';
import { getPdfPageCount, mergePdfs } from '../pdf/mergePdfs';
import type { DocumentMeta, LibraryStore } from '../library/types';
import type { ReadBytes } from './scanWorkflow';

export type PickedPdf = { uri: string; name: string; password?: string };
export type LoadedPdf = { uri: string; name: string; pageCount: number; password?: string };
export type AskPassword = (fileName: string, wrongBefore: boolean) => Promise<string | null>;

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
  let password = knownPassword;
  for (;;) {
    try {
      const pageCount = await getPdfPageCount(bytes, fileName, password);
      if (password !== undefined) log.info('pdf.unlocked', { file: fileName });
      return password === undefined ? { pageCount } : { pageCount, password };
    } catch (e) {
      const wrong = e instanceof PdfPasswordError;
      if (!askPassword || !(wrong || e instanceof PdfEncryptedError)) throw e;
      const answer = await askPassword(fileName, wrong);
      if (answer === null) {
        log.info('pdf.unlockSkipped', { file: fileName });
        return null;
      }
      password = answer;
    }
  }
}

export async function loadPickedPdfs(
  deps: { readBytes: ReadBytes; askPassword?: AskPassword },
  files: PickedPdf[],
): Promise<{ loaded: LoadedPdf[]; failed: AppError[]; skipped: string[] }> {
  const loaded: LoadedPdf[] = [];
  const failed: AppError[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    let bytes: Uint8Array;
    try {
      bytes = await deps.readBytes(file.uri);
    } catch (cause) {
      failed.push(new FileReadError({ fileName: file.name, cause }));
      continue;
    }
    try {
      const opened = await openPdfWithPassword(bytes, file.name, deps.askPassword, file.password);
      if (opened === null) skipped.push(file.name);
      else loaded.push({ uri: file.uri, name: file.name, ...opened });
    } catch (e) {
      failed.push(e instanceof AppError ? withFileName(e, file.name) : new PdfLoadError({ fileName: file.name, cause: e }));
    }
  }
  return { loaded, failed, skipped };
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
