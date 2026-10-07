export const FALLBACK_NAME = 'Tài liệu';

/**
 * Readable file name from a shared URI. DocumentsProvider ids look like `primary%3ADownload%2Fx.pdf`
 * (`<volume>:<path>`), so after decoding keep only what follows the last `/` and the last `:`.
 */
export function displayNameFromUri(uri: string): string {
  const last = uri
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, '')
    .split(/[?#]/)[0].split('/').filter(Boolean).pop();
  if (!last) return FALLBACK_NAME;
  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    // malformed percent sequence — keep the raw segment
  }
  const name = decoded.slice(decoded.lastIndexOf('/') + 1);
  return name.slice(name.lastIndexOf(':') + 1).trim() || FALLBACK_NAME;
}
