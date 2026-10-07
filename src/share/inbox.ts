/**
 * True for a file iOS copied into the app's `Documents/Inbox` for "Open in" — ours to delete once
 * imported (it would otherwise stay there and be backed up). Only `file://` URIs whose decoded path has
 * a `/Documents/Inbox/` folder count: a deep link can point anywhere in the sandbox. Never throws.
 */
export function isIosInboxFile(uri: string): boolean {
  if (typeof uri !== 'string' || !/^file:\/\//i.test(uri)) return false;
  try {
    const path = decodeURIComponent(uri.replace(/^file:\/\/[^/]*/i, '').split(/[?#]/)[0]);
    return path.includes('/Documents/Inbox/');
  } catch {
    return false;
  }
}
