import { PdfEncryptedError, PdfLoadError } from '../../src/errors/AppError';
import { getPdfPageCount } from '../../src/pdf/mergePdfs';
import { loadPickedPdfs } from '../../src/workflows/mergeWorkflow';

jest.mock('../../src/pdf/mergePdfs', () => ({ getPdfPageCount: jest.fn(), mergePdfs: jest.fn() }));
const mockCount = getPdfPageCount as jest.Mock;
const readBytes = async () => new Uint8Array([1]);

test('a plain Error from the load step becomes PdfLoadError with the file name', async () => {
  const cause = new TypeError("Cannot read property 'Pages' of undefined");
  mockCount.mockRejectedValueOnce(cause);
  const { failed } = await loadPickedPdfs({ readBytes }, [{ uri: 'u', name: 'file-hong.pdf' }]);
  expect(failed[0]).toBeInstanceOf(PdfLoadError);
  expect(failed[0].fileName).toBe('file-hong.pdf');
  expect(failed[0].cause).toBe(cause);
});

test('an AppError without a file name gets the file name, keeping its class', async () => {
  mockCount.mockRejectedValueOnce(new PdfEncryptedError({ index: 0 }));
  const { failed } = await loadPickedPdfs({ readBytes }, [{ uri: 'u', name: 'e.pdf' }]);
  expect(failed[0]).toBeInstanceOf(PdfEncryptedError);
  expect(failed[0].fileName).toBe('e.pdf');
});
