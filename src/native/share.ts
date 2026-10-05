import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { shareFileName } from '../utils/format';

/**
 * Share a library PDF under the document's name: the stored file is named by id, so copy it to
 * cache/share/<name>.pdf first. The share folder is cleared each time so copies don't pile up.
 */
export async function shareDocument(uri: string, name: string): Promise<void> {
  const dir = new Directory(Paths.cache, 'share');
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true, idempotent: true });
  const copy = new File(dir, shareFileName(name));
  new File(uri).copySync(copy);
  await Sharing.shareAsync(copy.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
}
