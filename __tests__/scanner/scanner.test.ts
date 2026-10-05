import DocumentScanner from 'react-native-document-scanner-plugin';
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
    expect(scan).toHaveBeenCalledWith({ croppedImageQuality: 90 });
  });

  it('returns [] on cancel', async () => {
    scan.mockResolvedValue({ status: 'cancel' });
    await expect(scanDocuments()).resolves.toEqual([]);
  });

  it('maps permission errors to CAMERA_PERMISSION', async () => {
    scan.mockRejectedValue(new Error('Camera permission denied'));
    await expect(scanDocuments()).rejects.toThrow('CAMERA_PERMISSION');
  });

  it('rethrows other errors', async () => {
    scan.mockRejectedValue(new Error('boom'));
    await expect(scanDocuments()).rejects.toThrow('boom');
  });
});
