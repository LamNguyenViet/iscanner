import DocumentScanner from 'react-native-document-scanner-plugin';
import { CameraPermissionError, ScannerUnavailableError, UnknownError } from '../../src/errors/AppError';
import { scanDocuments } from '../../src/scanner/scanner';

jest.mock('react-native-document-scanner-plugin', () => ({
  __esModule: true,
  default: { scanDocument: jest.fn() },
}));

const scan = DocumentScanner.scanDocument as jest.Mock;

describe('scanDocuments', () => {
  it('returns scanned images on success', async () => {
    scan.mockResolvedValue({ status: 'success', scannedImages: ['a', 'b'] });
    await expect(scanDocuments()).resolves.toEqual(['a', 'b']);
    expect(scan).toHaveBeenCalledWith({ croppedImageQuality: 100 });
  });

  it('passes maxPages as maxNumDocuments', async () => {
    scan.mockResolvedValue({ status: 'success', scannedImages: ['a'] });
    await scanDocuments({ maxPages: 1 });
    expect(scan).toHaveBeenCalledWith({ croppedImageQuality: 100, maxNumDocuments: 1 });
  });

  it('returns [] on cancel', async () => {
    scan.mockResolvedValue({ status: 'cancel' });
    await expect(scanDocuments()).resolves.toEqual([]);
  });

  it.each([
    ['User denied camera permission', CameraPermissionError],
    ['Google Play services not available', ScannerUnavailableError],
    ['weird', UnknownError],
  ])('maps "%s" to its typed error', async (message, Klass) => {
    scan.mockRejectedValue(new Error(message));
    await expect(scanDocuments()).rejects.toBeInstanceOf(Klass);
  });
});
