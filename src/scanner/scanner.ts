import DocumentScanner from 'react-native-document-scanner-plugin';

export async function scanDocuments(): Promise<string[]> {
  try {
    const result = await DocumentScanner.scanDocument({ croppedImageQuality: 90 });
    return result.status === 'success' ? (result.scannedImages ?? []) : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/permission/i.test(message)) throw new Error('CAMERA_PERMISSION');
    throw error;
  }
}
