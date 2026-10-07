import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { ShareError } from '../errors/AppError';

/** Write the export text into the cache folder and return its file:// uri. */
export async function writeLogExport(name: string, text: string): Promise<string> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  return file.uri;
}

export async function shareLogFile(uri: string): Promise<void> {
  try {
    await Sharing.shareAsync(uri, { mimeType: 'text/plain', UTI: 'public.plain-text' });
  } catch (cause) {
    throw new ShareError({ cause });
  }
}
