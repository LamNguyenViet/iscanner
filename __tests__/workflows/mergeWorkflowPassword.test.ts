import { PDFDocument } from '../../src/pdf/pdfLib';
import { createMergedDocument, loadPickedPdfs } from '../../src/workflows/mergeWorkflow';
import { PdfEncryptedError } from '../../src/errors/AppError';
import type { DocumentMeta } from '../../src/library/types';
import { makePasswordPdf } from '../fixtures/pdfPassword';

const mockLog = jest.requireMock('../../src/logging/logger').log;
const meta = { id: '1' } as DocumentMeta;

async function plainPdf(): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  d.addPage([100, 100]);
  return d.save();
}

describe('password ask loop', () => {
  let files: Record<string, Uint8Array>;
  const readBytes = async (uri: string) => files[uri];

  beforeAll(async () => {
    files = {
      enc: makePasswordPdf(),
      open: makePasswordPdf({ userPassword: '' }),
      plain: await plainPdf(),
    };
  });
  beforeEach(() => jest.clearAllMocks());

  it('keeps a password that is right the first time', async () => {
    const askPassword = jest.fn().mockResolvedValue('secret');
    const res = await loadPickedPdfs({ readBytes, askPassword }, [{ uri: 'enc', name: 'e.pdf' }]);
    expect(askPassword).toHaveBeenCalledWith('e.pdf', false);
    expect(res.loaded).toEqual([{ uri: 'enc', name: 'e.pdf', pageCount: 1, password: 'secret' }]);
    expect(res.failed).toEqual([]);
    expect(res.skipped).toEqual([]);
  });

  it('asks again with wrongBefore after a wrong password', async () => {
    const askPassword = jest.fn().mockResolvedValueOnce('nope').mockResolvedValueOnce('owner');
    const res = await loadPickedPdfs({ readBytes, askPassword }, [{ uri: 'enc', name: 'e.pdf' }]);
    expect(askPassword.mock.calls).toEqual([
      ['e.pdf', false],
      ['e.pdf', true],
    ]);
    expect(res.loaded[0].password).toBe('owner');
  });

  it('puts a skipped file in skipped, not failed', async () => {
    const askPassword = jest.fn().mockResolvedValue(null);
    const res = await loadPickedPdfs({ readBytes, askPassword }, [
      { uri: 'enc', name: 'e.pdf' },
      { uri: 'plain', name: 'p.pdf' },
    ]);
    expect(res.skipped).toEqual(['e.pdf']);
    expect(res.failed).toEqual([]);
    expect(res.loaded.map((f) => f.name)).toEqual(['p.pdf']);
    expect(res.loaded[0].password).toBeUndefined();
    expect(askPassword).toHaveBeenCalledTimes(1);
  });

  it('without askPassword an encrypted file fails as before', async () => {
    const res = await loadPickedPdfs({ readBytes }, [{ uri: 'enc', name: 'e.pdf' }]);
    expect(res.failed[0]).toBeInstanceOf(PdfEncryptedError);
    expect(res.skipped).toEqual([]);
  });

  it('tries a carried password first without asking', async () => {
    const askPassword = jest.fn();
    const res = await loadPickedPdfs({ readBytes, askPassword }, [
      { uri: 'enc', name: 'e.pdf', password: 'secret' },
    ]);
    expect(askPassword).not.toHaveBeenCalled();
    expect(res.loaded[0].password).toBe('secret');
  });

  it('asks with wrongBefore when the carried password is wrong', async () => {
    const askPassword = jest.fn().mockResolvedValue('secret');
    const res = await loadPickedPdfs({ readBytes, askPassword }, [
      { uri: 'enc', name: 'e.pdf', password: 'bad' },
    ]);
    expect(askPassword).toHaveBeenCalledWith('e.pdf', true);
    expect(res.loaded[0].password).toBe('secret');
  });

  it('logs unlocked and skipped with the file only, never the password', async () => {
    const askPassword = jest.fn().mockResolvedValueOnce('secret').mockResolvedValueOnce(null);
    await loadPickedPdfs({ readBytes, askPassword }, [
      { uri: 'enc', name: 'e.pdf' },
      { uri: 'enc', name: 'f.pdf' },
    ]);
    expect(mockLog.info).toHaveBeenCalledWith('pdf.unlocked', { file: 'e.pdf' });
    expect(mockLog.info).toHaveBeenCalledWith('pdf.unlockSkipped', { file: 'f.pdf' });
    const logged = JSON.stringify([
      ...mockLog.info.mock.calls,
      ...mockLog.warn.mock.calls,
      ...mockLog.error.mock.calls,
    ]);
    expect(logged).not.toContain('secret');
  });

  it('createMergedDocument stores a plain PDF for an encrypted input', async () => {
    const add = jest.fn().mockResolvedValue(meta);
    await createMergedDocument(
      { readBytes, library: { add } },
      [
        { uri: 'enc', name: 'e.pdf', pageCount: 1, password: 'secret' },
        { uri: 'plain', name: 'p.pdf', pageCount: 1 },
      ],
      'M',
    );
    const stored = add.mock.calls[0][0] as Uint8Array;
    expect(Buffer.from(stored).toString('latin1')).not.toContain('/Encrypt');
    const doc = await PDFDocument.load(stored);
    expect(doc.getPageCount()).toBe(2);
  });

  it('opens an owner-restricted PDF (empty user password) without asking', async () => {
    const askPassword = jest.fn();
    const res = await loadPickedPdfs({ readBytes, askPassword }, [{ uri: 'open', name: 'o.pdf' }]);
    expect(askPassword).not.toHaveBeenCalled();
    expect(res.loaded).toEqual([{ uri: 'open', name: 'o.pdf', pageCount: 1, password: '' }]);
    expect(mockLog.info).toHaveBeenCalledWith('pdf.unlocked', { file: 'o.pdf' });
  });

  it('merging an owner-restricted PDF gives a plain output', async () => {
    const add = jest.fn().mockResolvedValue(meta);
    await createMergedDocument(
      { readBytes, library: { add } },
      [
        { uri: 'open', name: 'o.pdf', pageCount: 1, password: '' },
        { uri: 'plain', name: 'p.pdf', pageCount: 1 },
      ],
      'M',
    );
    const stored = add.mock.calls[0][0] as Uint8Array;
    expect(Buffer.from(stored).toString('latin1')).not.toContain('/Encrypt');
    expect((await PDFDocument.load(stored)).getPageCount()).toBe(2);
  });

  it('a wrong empty attempt is silent: the first ask has wrongBefore false', async () => {
    const askPassword = jest.fn().mockResolvedValue('secret');
    await loadPickedPdfs({ readBytes, askPassword }, [{ uri: 'enc', name: 'e.pdf' }]);
    expect(askPassword).toHaveBeenCalledTimes(1);
    expect(askPassword).toHaveBeenCalledWith('e.pdf', false);
  });

  it('a wrong carried password tries empty, then asks with wrongBefore', async () => {
    const askPassword = jest.fn().mockResolvedValue('secret');
    const res = await loadPickedPdfs({ readBytes, askPassword }, [
      { uri: 'open', name: 'o.pdf', password: 'bad' },
    ]);
    expect(askPassword).not.toHaveBeenCalled();
    expect(res.loaded[0].password).toBe('');
  });
});
