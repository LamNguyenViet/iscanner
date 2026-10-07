import { CameraPermissionError, ScannerUnavailableError, toAppError } from '../errors/AppError';
import DocumentScanner from 'react-native-document-scanner-plugin';

/** Captures pages; `maxPages` limits the count on Android (iOS ignores it). */
export async function scanDocuments(options?: { maxPages?: number }): Promise<string[]> {
  try {
    const result = await DocumentScanner.scanDocument({
      croppedImageQuality: 100,
      ...(options?.maxPages !== undefined ? { maxNumDocuments: options.maxPages } : {}),
    });
    return result.status === 'success' ? (result.scannedImages ?? []) : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/permission/i.test(message)) throw new CameraPermissionError({ cause: error });
    if (/google play|not available|unavailable|not supported/i.test(message)) {
      throw new ScannerUnavailableError({ cause: error });
    }
    throw toAppError(error);
  }
}
