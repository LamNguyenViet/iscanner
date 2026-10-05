import { getPdfPageCount, mergePdfs } from '../pdf/mergePdfs';
import type { DocumentMeta, LibraryStore } from '../library/types';
import type { ReadBytes } from './scanWorkflow';

export type PickedPdf = { uri: string; name: string };
export type LoadedPdf = { uri: string; name: string; pageCount: number };

export async function loadPickedPdfs(
  deps: { readBytes: ReadBytes },
  files: PickedPdf[],
): Promise<{ loaded: LoadedPdf[]; failed: string[] }> {
  const loaded: LoadedPdf[] = [];
  const failed: string[] = [];
  for (const file of files) {
    try {
      const bytes = await deps.readBytes(file.uri);
      const pageCount = await getPdfPageCount(bytes);
      loaded.push({ uri: file.uri, name: file.name, pageCount });
    } catch {
      failed.push(file.name);
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
