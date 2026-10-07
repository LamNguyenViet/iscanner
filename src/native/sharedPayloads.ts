import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { log } from '../logging/logger';
import { displayNameFromUri } from '../share/displayName';

const FILE_URI = /^(content|file):\/\//i;

/**
 * Files other apps shared into iScanner (Android only): the sender's original URIs, which
 * `importIncoming` copies under generated names. Never throws.
 *
 * Deliberately not `getResolvedSharedPayloadsAsync`: it copies every shared file to
 * `cacheDir/<sender-supplied DISPLAY_NAME>`, so a crafted name like `../files/x` could overwrite
 * iScanner's private files. The name here is for display only and is derived from the URI.
 */
export async function readSharedFiles(): Promise<{ uri: string; name?: string }[]> {
  if (Platform.OS !== 'android') return [];
  try {
    const out: { uri: string; name?: string }[] = [];
    for (const p of Sharing.getSharedPayloads()) {
      if ((p.shareType === 'file' || p.shareType === 'image') && FILE_URI.test(p.value ?? '')) {
        out.push({ uri: p.value, name: displayNameFromUri(p.value) });
      }
    }
    return out;
  } catch (e) {
    log.warn('readSharedFiles failed', { cause: e });
    return [];
  }
}

/**
 * True while a share is waiting to be read. Cheap and synchronous: it reads the intent expo-sharing
 * keeps natively, which stays there until `clearSharedFiles` (the JS share event can be missed). Never throws.
 */
export function hasSharedFiles(): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    return Sharing.getSharedPayloads().length > 0;
  } catch (e) {
    log.warn('hasSharedFiles failed', { cause: e });
    return false;
  }
}

export function clearSharedFiles(): void {
  Sharing.clearSharedPayloads();
}
