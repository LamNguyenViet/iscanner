import * as Sharing from 'expo-sharing';

export async function shareDocument(uri: string): Promise<void> {
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
}
