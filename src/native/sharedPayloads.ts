import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { displayNameFromUri } from '../share/displayName';

/** Files other apps shared into iScanner (Android only). Never throws. */
export async function readSharedFiles(): Promise<{ uri: string; name?: string }[]> {
  if (Platform.OS !== 'android') return [];
  try {
    const payloads = await Sharing.getResolvedSharedPayloadsAsync();
    const out: { uri: string; name?: string }[] = [];
    for (const p of payloads) {
      if ((p.contentType === 'file' || p.contentType === 'image') && p.contentUri) {
        const name = p.originalName || (p.value ? displayNameFromUri(p.value) : undefined);
        out.push({ uri: p.contentUri, name });
      }
    }
    return out;
  } catch {
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
  } catch {
    return false;
  }
}

export function clearSharedFiles(): void {
  Sharing.clearSharedPayloads();
}
