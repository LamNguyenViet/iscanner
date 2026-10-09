import type { WordDeps } from '../convert/convertWord';
import { decryptOffice, isOfficeEncrypted } from './officeCrypto';
import { printHtmlToPdf } from './printPdf';

/** The native pieces of Word conversion, ready to pass as `word` deps. */
export const wordNativeDeps: Omit<WordDeps, 'readBytes' | 'askPassword'> = {
  printHtmlToPdf,
  decryptOffice,
  isOfficeEncrypted,
};
