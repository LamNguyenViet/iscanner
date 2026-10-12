import { WordConvertError } from '../../src/errors/AppError';
import { convertWordToPdf } from '../../src/convert/convertWord';
import { convertWordFilesToLibrary } from '../../src/workflows/wordWorkflow';

jest.mock('../../src/convert/convertWord', () => ({ convertWordToPdf: jest.fn() }));
const mockConvert = convertWordToPdf as jest.Mock;

function setup() {
  const add = jest.fn(async (_b: Uint8Array, input: any) => ({ id: input.name, ...input }));
  const deleteFiles = jest.fn().mockResolvedValue(undefined);
  const deps: any = {
    readBytes: jest.fn().mockResolvedValue(new Uint8Array([1])),
    printHtmlToPdf: jest.fn(),
    decryptOffice: jest.fn(),
    isOfficeEncrypted: jest.fn(),
    library: { add },
    deleteFiles,
  };
  return { deps, add, deleteFiles };
}

beforeEach(() => mockConvert.mockReset());

test('saves one document per file named after the file without extension', async () => {
  const { deps, add, deleteFiles } = setup();
  mockConvert.mockImplementation(async (_d, f) => ({ uri: `file:///c/${f.name}.pdf`, pageCount: 2 }));
  const res = await convertWordFilesToLibrary(deps, [
    { uri: 'a', name: 'hop-dong.docx' },
    { uri: 'b', name: 'bao-cao.DOCX' },
  ]);
  expect(res.saved.map((d) => d.name)).toEqual(['hop-dong', 'bao-cao']);
  expect(add).toHaveBeenCalledWith(expect.any(Uint8Array), { name: 'hop-dong', pageCount: 2, source: 'merge' });
  expect(res.failed).toEqual([]);
  expect(deleteFiles).toHaveBeenCalledWith(['file:///c/hop-dong.docx.pdf', 'file:///c/bao-cao.DOCX.pdf']);
});

test('a corrupt file fails with its name while the others are saved', async () => {
  const { deps, deleteFiles } = setup();
  mockConvert
    .mockRejectedValueOnce(new WordConvertError({ fileName: 'bad.docx' }))
    .mockResolvedValueOnce({ uri: 'file:///c/ok.pdf', pageCount: 1 });
  const res = await convertWordFilesToLibrary(deps, [
    { uri: 'a', name: 'bad.docx' },
    { uri: 'b', name: 'ok.docx' },
  ]);
  expect(res.saved).toHaveLength(1);
  expect(res.failed).toHaveLength(1);
  expect(res.failed[0].fileName).toBe('bad.docx');
  expect(deleteFiles).toHaveBeenCalledWith(['file:///c/ok.pdf']);
});

test('a skipped encrypted file is listed in skipped without failure', async () => {
  const { deps, add } = setup();
  mockConvert.mockResolvedValue(null);
  const res = await convertWordFilesToLibrary(deps, [{ uri: 'a', name: 'locked.docx' }]);
  expect(res).toEqual({ saved: [], failed: [], skipped: ['locked.docx'] });
  expect(add).not.toHaveBeenCalled();
});

test('deletes the converted cache file when saving fails', async () => {
  const { deps, add, deleteFiles } = setup();
  add.mockRejectedValueOnce(new Error('disk full'));
  mockConvert.mockResolvedValue({ uri: 'file:///c/x.pdf', pageCount: 1 });
  const res = await convertWordFilesToLibrary(deps, [{ uri: 'a', name: 'x.docx' }]);
  expect(res.failed).toHaveLength(1);
  expect(res.failed[0].fileName).toBe('x.docx');
  expect(deleteFiles).toHaveBeenCalledWith(['file:///c/x.pdf']);
});
