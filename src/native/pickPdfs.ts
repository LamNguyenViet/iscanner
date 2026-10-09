import * as DocumentPicker from 'expo-document-picker';
import type { PickedPdf } from '../workflows/mergeWorkflow';

export const WORD_MIME_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export async function pickDocuments(types: string[]): Promise<PickedPdf[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: types,
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => ({ uri: asset.uri, name: asset.name }));
}

export function pickPdfs(): Promise<PickedPdf[]> {
  return pickDocuments(['application/pdf']);
}
