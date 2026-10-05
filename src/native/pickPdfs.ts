import * as DocumentPicker from 'expo-document-picker';
import type { PickedPdf } from '../workflows/mergeWorkflow';

export async function pickPdfs(): Promise<PickedPdf[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => ({ uri: asset.uri, name: asset.name }));
}
