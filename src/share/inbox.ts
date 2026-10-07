/**
 * True only for a file iOS copied into the app's `Documents/Inbox` for "Open in" — ours to delete once
 * imported (it would otherwise stay there and be backed up). A deep link can point anywhere in the
 * sandbox, so this is strict: a `file:` URI whose percent-decoded path has no `.`/`..` segment and no
 * backslash, and ends in `/Documents/Inbox/<name>` (the file sits directly in the Inbox, no subfolder).
 * Pure; malformed input returns false, never throws.
 */
export function isIosInboxFile(uri: string): boolean {
  if (typeof uri !== 'string' || !/^file:\/\//i.test(uri)) return false;
  try {
    const path = decodeURIComponent(uri.replace(/^file:\/\/[^/]*/i, '').split(/[?#]/)[0]);
    if (path.includes('\\')) return false;
    if (path.split('/').some((segment) => segment === '.' || segment === '..')) return false;
    return /\/Documents\/Inbox\/[^/]+$/.test(path);
  } catch {
    return false;
  }
}
