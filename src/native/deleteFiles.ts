import { File } from 'expo-file-system';

/** Best-effort deletion of temporary files (scanned images, picked PDF copies). Never throws. */
export async function deleteFiles(uris: string[]): Promise<void> {
  for (const uri of uris) {
    try {
      new File(uri).delete();
    } catch {
      // already gone or not deletable — ignore
    }
  }
}
