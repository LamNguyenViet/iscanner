import { Directory, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking } from 'react-native';
import { UpdateCorruptError, UpdateDownloadError, UpdateInstallError } from '../errors/AppError';
import type { PlatformUpdate } from '../update/config';

const GRANT_READ_URI = 0x1;
const NEW_TASK = 0x10000000;

export async function downloadAndInstallApk(
  target: PlatformUpdate,
  deps: {
    downloadFile?: (url: string, dest: File) => Promise<File>;
    startActivity?: typeof IntentLauncher.startActivityAsync;
    cacheDir?: Directory;
    /** Checked after download and verification; when true the installer is not opened. */
    isCancelled?: () => boolean;
  } = {},
): Promise<void> {
  const downloadFile = deps.downloadFile ?? ((url: string, dest: File) => File.downloadFileAsync(url, dest));
  const startActivity = deps.startActivity ?? IntentLauncher.startActivityAsync;
  const dir = new Directory(deps.cacheDir ?? Paths.cache, 'update');

  let file: File;
  try {
    if (dir.exists) dir.delete();
    dir.create({ intermediates: true, idempotent: true });
    file = await downloadFile(target.url, new File(dir, `iScanner-${target.latestBuild}.apk`));
  } catch (e) {
    throw new UpdateDownloadError({ cause: e });
  }

  const actual = file.md5?.toLowerCase();
  if (!actual || actual !== (target.md5 ?? '').toLowerCase()) {
    try {
      file.delete();
    } catch {
      // best effort
    }
    throw new UpdateCorruptError();
  }

  if (deps.isCancelled?.()) return;

  try {
    await startActivity('android.intent.action.VIEW', {
      data: file.contentUri,
      type: 'application/vnd.android.package-archive',
      flags: GRANT_READ_URI | NEW_TASK,
    });
  } catch (e) {
    throw new UpdateInstallError({ cause: e });
  }
}

export async function openUpdatePage(url: string): Promise<void> {
  await Linking.openURL(url);
}
