import type { Strings } from '../i18n/vi';
import type { AppError, ErrorCode } from './AppError';

export type ErrorContent = { title: string; message: string; code: ErrorCode };

export function errorContent(err: AppError, t: Strings): ErrorContent {
  const { title, message } = t.errors[err.code];
  return { title, message, code: err.code };
}

/**
 * One error: its message (led by the file name when it has one). Several: one line per file with a short
 * reason, under the first error's title and code.
 */
export function errorsContent(errs: AppError[], t: Strings): ErrorContent {
  if (errs.length === 1) {
    const content = errorContent(errs[0], t);
    const { fileName } = errs[0];
    return fileName ? { ...content, message: `${fileName}\n${content.message}` } : content;
  }
  const first = errs[0];
  const message = errs
    .map((e) => `${e.fileName || t.common.untitled} — ${t.errors.reason[e.code] ?? t.errors[e.code].title}`)
    .join('\n');
  return { title: t.errors[first.code].title, message, code: first.code };
}
