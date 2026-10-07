import type { Strings } from '../i18n/vi';
import type { AppError, ErrorCode } from './AppError';

export type ErrorContent = { title: string; message: string; code: ErrorCode };

export function errorContent(err: AppError, t: Strings): ErrorContent {
  const { title, message } = t.errors[err.code];
  return { title, message, code: err.code };
}

/** `forceList` keeps the per-file line form for a single failed file (it names the file). */
export function errorsContent(errs: AppError[], t: Strings, forceList = false): ErrorContent {
  if (errs.length === 1 && !forceList) return errorContent(errs[0], t);
  const first = errs[0];
  const message = errs
    .map((e) => `${e.fileName || t.common.untitled} — ${t.errors.reason[e.code] ?? t.errors[e.code].title}`)
    .join('\n');
  return { title: t.errors[first.code].title, message, code: first.code };
}
