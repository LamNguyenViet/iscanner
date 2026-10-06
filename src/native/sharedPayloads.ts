import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';

/** Files other apps shared into iScanner (Android only). Never throws. */
export async function readSharedFiles(): Promise<{ uri: string; name?: string }[]> {
  if (Platform.OS !== 'android') return [];
  try {
    const payloads = await Sharing.getResolvedSharedPayloadsAsync();
    const out: { uri: string; name?: string }[] = [];
    for (const p of payloads) {
      if ((p.contentType === 'file' || p.contentType === 'image') && p.contentUri) {
        const name = p.originalName || p.value?.split('/').filter(Boolean).pop() || undefined;
        out.push({ uri: p.contentUri, name });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function clearSharedFiles(): void {
  Sharing.clearSharedPayloads();
}
