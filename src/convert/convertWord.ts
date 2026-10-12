import { AppError, WordConvertError, WordPasswordError, withFileName } from '../errors/AppError';
import { log } from '../logging/logger';
import { getPdfPageCount } from '../pdf/mergePdfs';
import { withPasswordLoop, type AskPassword } from '../workflows/passwordLoop';
import type { ReadBytes } from '../workflows/scanWorkflow';
import { detectWordKind } from './detect';
import { docToHtml, docxToHtml } from './html';
import type { PageSetup, WordKind } from './types';

export type WordDeps = {
  readBytes: ReadBytes;
  printHtmlToPdf: (html: string, page: PageSetup) => Promise<string>;
  decryptOffice: (bytes: Uint8Array, password: string) => Promise<Uint8Array>;
  isOfficeEncrypted: (bytes: Uint8Array) => boolean;
  askPassword?: AskPassword;
  /** Best-effort cleanup of the printed PDF when it cannot be used. */
  deleteFiles?: (uris: string[]) => Promise<void>;
};

/** Private marker: an encrypted file was opened before any password was given. Never escapes. */
class NeedsPassword extends Error {}

/**
 * Converts a Word file (DOC, DOCX, password-protected) to a PDF in the cache directory.
 * Resolves null when the user skips the password prompt. Passwords are never logged.
 */
export async function convertWordToPdf(
  deps: WordDeps,
  file: { uri: string; name: string; password?: string },
): Promise<{ uri: string; pageCount: number } | null> {
  const fileName = file.name;
  const started = Date.now();
  try {
    let bytes = await deps.readBytes(file.uri);
    let kind: WordKind | null = detectWordKind(bytes);
    if (kind === null) throw new WordConvertError({ fileName });
    const logKind = kind;

    if (kind === 'docx-encrypted' || (kind === 'doc' && deps.isOfficeEncrypted(bytes))) {
      const encrypted = bytes;
      const unlocked = await withPasswordLoop(
        async (password) => {
          if (password === undefined) throw new NeedsPassword();
          return deps.decryptOffice(encrypted, password);
        },
        {
          fileName,
          ask: deps.askPassword,
          known: file.password,
          needsPassword: (e) => e instanceof NeedsPassword,
          wrongPassword: (e) => e instanceof WordPasswordError,
          event: 'word',
        },
      );
      if (unlocked === null) return null;
      bytes = unlocked.value;
      kind = detectWordKind(bytes);
      if (kind === null || kind === 'docx-encrypted') throw new WordConvertError({ fileName });
    }

    const { html, page } = kind === 'doc' ? await docToHtml(bytes) : await docxToHtml(bytes);
    const uri = await deps.printHtmlToPdf(html, page);
    let pageCount: number;
    try {
      const pdf = await deps.readBytes(uri);
      pageCount = await getPdfPageCount(pdf, fileName);
    } catch (e) {
      await deps.deleteFiles?.([uri]).catch(() => {});
      throw new WordConvertError({ fileName, cause: e });
    }
    log.info('word.converted', { file: fileName, kind: logKind, ms: Date.now() - started });
    return { uri, pageCount };
  } catch (e) {
    if (e instanceof NeedsPassword) throw new WordConvertError({ fileName });
    if (e instanceof AppError) throw withFileName(e, fileName);
    throw new WordConvertError({ fileName, cause: e });
  }
}
