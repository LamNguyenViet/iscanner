import { Directory, Paths } from 'expo-file-system';

/** Removes the downloaded update APK folder. Best effort; never throws. */
export function clearUpdateCache(): void {
  try {
    const dir = new Directory(Paths.cache, 'update');
    if (dir.exists) dir.delete();
  } catch {
    // best effort
  }
}
