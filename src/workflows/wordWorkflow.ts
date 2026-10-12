import { AppError, WordConvertError, withFileName } from '../errors/AppError';
import { convertWordToPdf, type WordDeps } from '../convert/convertWord';
import type { DocumentMeta, LibraryStore } from '../library/types';
import type { PickedPdf } from './mergeWorkflow';

export type WordLibraryDeps = WordDeps & {
  library: Pick<LibraryStore, 'add'>;
  deleteFiles: (uris: string[]) => Promise<void>;
  /** Name used when a file name has nothing left after dropping its extension. */
  untitled?: string;
};

const baseName = (fileName: string) => fileName.replace(/\.[^./\\]*$/, '').trim();

/**
 * Converts each picked Word file and saves it as its own library document, named after the file.
 * One bad file never stops the others. Converted cache files are always deleted afterwards.
 */
export async function convertWordFilesToLibrary(
  deps: WordLibraryDeps,
  files: PickedPdf[],
): Promise<{ saved: DocumentMeta[]; failed: AppError[]; skipped: string[] }> {
  const saved: DocumentMeta[] = [];
  const failed: AppError[] = [];
  const skipped: string[] = [];
  const converted: string[] = [];
  for (const file of files) {
    try {
      const res = await convertWordToPdf(deps, file);
      if (res === null) {
        skipped.push(file.name);
        continue;
      }
      converted.push(res.uri);
      const bytes = await deps.readBytes(res.uri);
      const name = baseName(file.name) || deps.untitled || file.name;
      saved.push(await deps.library.add(bytes, { name, pageCount: res.pageCount, source: 'merge' }));
    } catch (e) {
      failed.push(e instanceof AppError ? withFileName(e, file.name) : new WordConvertError({ fileName: file.name, cause: e }));
    }
  }
  if (converted.length > 0) await deps.deleteFiles(converted).catch(() => {});
  return { saved, failed, skipped };
}
