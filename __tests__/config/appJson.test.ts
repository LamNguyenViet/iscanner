import { readFileSync } from 'fs';
import { join } from 'path';

const app = JSON.parse(readFileSync(join(__dirname, '..', '..', 'app.json'), 'utf8')).expo;
const MIME = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

test('Android VIEW filters accept Word MIME types', () => {
  const mimes = app.android.intentFilters.flatMap((f: any) => f.data.map((d: any) => d.mimeType));
  expect(mimes).toEqual(expect.arrayContaining(MIME));
});

test('expo-sharing share lists include Word MIME types', () => {
  const entry = app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-sharing');
  expect(entry[1].android.singleShareMimeTypes).toEqual(expect.arrayContaining(MIME));
  expect(entry[1].android.multipleShareMimeTypes).toEqual(expect.arrayContaining(MIME));
});

test('iOS declares a Word document type with both UTIs', () => {
  const types = app.ios.infoPlist.CFBundleDocumentTypes;
  const entry = types.find((t: any) => t.LSItemContentTypes.includes('org.openxmlformats.wordprocessingml.document'));
  expect(entry.LSItemContentTypes).toEqual(
    expect.arrayContaining(['org.openxmlformats.wordprocessingml.document', 'com.microsoft.word.doc']),
  );
});
