const FILE_URL = /^(file|content):\/\//i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** True for the link expo-sharing turns an Android SEND intent into: `<scheme>://expo-sharing`. */
function isShareLink(path: string): boolean {
  const rest = path.replace(/^[a-z][a-z0-9+.-]*:/i, '').replace(/^\/+/, '');
  return /^expo-sharing(?:[/?#]|$)/i.test(rest);
}

/**
 * Maps a system URL to an app route: shared files and "open with" files go to `/incoming`,
 * everything else is returned unchanged. Never throws.
 *
 * The file URI is encoded twice because expo-router decodes a query param twice before the screen
 * reads it (URLSearchParams in getStateFromPath, then useLocalSearchParams); a single encoding would
 * corrupt URIs that contain percent-escapes (e.g. `…/document/msf%3A12`).
 *
 * The expo-sharing link only routes when it launches the app (`initial`). While the app runs it gives
 * '' (expo-router then ignores the link): that one-shot event is lost if JS is not listening when it
 * fires, so the root layout's foreground check of the waiting share owns warm shares, and routing here
 * too would open the screen twice.
 */
/**
 * Longest incoming link handled. expo-router decodes query strings with decode-uri-component
 * 0.2.2, which burns CPU on long malformed percent-encoding (GHSA-vcc3-ghjq-m6fr); no real
 * iScanner link comes close to this.
 */
export const MAX_INCOMING_PATH = 2048;

export function redirectIncomingPath(path: string, initial = true): string {
  try {
    if (typeof path !== 'string') return path;
    if (path.length > MAX_INCOMING_PATH) return '/';
    if (FILE_URL.test(path)) {
      return `/incoming?uri=${encodeURIComponent(encodeURIComponent(path))}`;
    }
    if (isShareLink(path)) return initial ? '/incoming' : '';
    return path;
  } catch {
    return path;
  }
}

/**
 * The file URI from the `/incoming` route's `uri` param, decoding any encoding layer still left.
 * Only `file://` and `content://` URIs are returned; anything else gives undefined.
 */
export function incomingUriParam(param: string | string[] | undefined): string | undefined {
  if (typeof param !== 'string' || param === '') return undefined;
  let value = param;
  for (let i = 0; i < 2 && !HAS_SCHEME.test(value); i++) {
    try {
      value = decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return FILE_URL.test(value) ? value : undefined;
}
