import { AppError, FileReadError, PdfLoadError, withFileName } from '../errors/AppError';
import { getPdfPageCount, mergePdfs } from '../pdf/mergePdfs';
import type { DocumentMeta, LibraryStore } from '../library/types';
import type { ReadBytes } from './scanWorkflow';

export type PickedPdf = { uri: string; name: string };
export type LoadedPdf = { uri: string; name: string; pageCount: number };

export async function loadPickedPdfs(
  deps: { readBytes: ReadBytes },
  files: PickedPdf[],
): Promise<{ loaded: LoadedPdf[]; failed: AppError[] }> {
  const loaded: LoadedPdf[] = [];
  const failed: AppError[] = [];
  for (const file of files) {
    let bytes: Uint8Array;
    try {
      bytes = await deps.readBytes(file.uri);
    } catch (cause) {
      failed.push(new FileReadError({ fileName: file.name, cause }));
      continue;
    }
    try {
      const pageCount = await getPdfPageCount(bytes, file.name);
      loaded.push({ uri: file.uri, name: file.name, pageCount });
    } catch (e) {
      failed.push(e instanceof AppError ? withFileName(e, file.name) : new PdfLoadError({ fileName: file.name, cause: e }));
    }
  }
  return { loaded, failed };
}

export async function createMergedDocument(
  deps: { readBytes: ReadBytes; library: Pick<LibraryStore, 'add'> },
  files: LoadedPdf[],
  name: string,
): Promise<DocumentMeta> {
  const pdfs: Uint8Array[] = [];
  for (const file of files) pdfs.push(await deps.readBytes(file.uri));
  const merged = await mergePdfs(pdfs);
  const pageCount = files.reduce((sum, f) => sum + f.pageCount, 0);
  return deps.library.add(merged, { name, pageCount, source: 'merge' });
}
