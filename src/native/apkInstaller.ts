import { Directory, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking } from 'react-native';
import { UpdateCorruptError, UpdateDownloadError, UpdateInstallError } from '../errors/AppError';
import type { PlatformUpdate } from '../update/config';

const GRANT_READ_URI = 0x1;
const NEW_TASK = 0x10000000;

let runCounter = 0;

export async function downloadAndInstallApk(
  target: PlatformUpdate,
  deps: {
    downloadFile?: (url: string, dest: File) => Promise<File>;
    startActivity?: typeof IntentLauncher.startActivityAsync;
    cacheDir?: Directory;
    /** Makes the file name unique to this run; defaults to a timestamp plus counter. */
    runId?: string;
    /** Checked after download and verification; when true the installer is not opened. */
    isCancelled?: () => boolean;
  } = {},
): Promise<void> {
  const downloadFile = deps.downloadFile ?? ((url: string, dest: File) => File.downloadFileAsync(url, dest));
  const startActivity = deps.startActivity ?? IntentLauncher.startActivityAsync;
  const dir = new Directory(deps.cacheDir ?? Paths.cache, 'update');

  const runId = deps.runId ?? `${Date.now()}-${runCounter++}`;
  const mine = new File(dir, `iScanner-${target.latestBuild}-${runId}.apk`);

  let file: File;
  try {
    dir.create({ intermediates: true, idempotent: true });
    deleteStaleApks(dir, mine);
    file = await downloadFile(target.url, mine);
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

/** Best effort: another run may be using the directory, so never remove it and never fail on a delete. */
function deleteStaleApks(dir: Directory, keep: File): void {
  try {
    for (const entry of dir.list()) {
      if (entry.uri === keep.uri || !entry.uri.endsWith('.apk')) continue;
      try {
        (entry as File).delete();
      } catch {
        // best effort
      }
    }
  } catch {
    // best effort
  }
}

export async function openUpdatePage(url: string): Promise<void> {
  await Linking.openURL(url);
}
