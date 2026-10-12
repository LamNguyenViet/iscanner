import fs from 'fs';
import { PDFDocument } from '../../src/pdf/pdfLib';
import { convertWordToPdf, type WordDeps } from '../../src/convert/convertWord';
import { WordConvertError, WordPasswordError } from '../../src/errors/AppError';
import { decryptOffice, isOfficeEncrypted } from '../../src/native/officeCrypto';
import {
  makeDocx,
  makeEncryptedDocx,
  makeStandardEncryptedDocx,
  SAMPLE_DOC_FIRST_LINE, SAMPLE_DOC_PATH,
  VI_TEXT,
} from '../fixtures/word';

// The native spin-loop module, replaced by an equivalent Node implementation.
jest.mock('../../src/native/officeCryptoNative', () => {
  const { createHash } = jest.requireActual('crypto');
  return {
    nativeIteratedHash: jest.fn((alg: string, initial: Uint8Array, spin: number) => {
      let h = Buffer.from(initial);
      const it = Buffer.alloc(4);
      for (let i = 0; i < spin; i++) {
        it.writeUInt32LE(i, 0);
        h = createHash(alg.toLowerCase()).update(it).update(h).digest();
      }
      return new Uint8Array(h);
    }),
  };
});

const mockLog = jest.requireMock('../../src/logging/logger').log;

let files: Record<string, Uint8Array>;
let printHtmlToPdf: jest.Mock;
let deleteFiles: jest.Mock;

function deps(askPassword?: WordDeps['askPassword']): WordDeps {
  return {
    readBytes: async (uri) => files[uri],
    printHtmlToPdf,
    decryptOffice,
    isOfficeEncrypted,
    askPassword,
    deleteFiles,
  };
}

function loggedText(): string {
  return JSON.stringify(Object.values(mockLog).map((f) => (f as jest.Mock).mock?.calls));
}

beforeAll(async () => {
  const d = await PDFDocument.create();
  d.addPage([100, 100]);
  d.addPage([100, 100]);
  files = {
    plain: await makeDocx(),
    enc: await makeEncryptedDocx('secret'),
    stdEnc: await makeStandardEncryptedDocx('secret'),
    junk: new Uint8Array([1, 2, 3, 4, 5]),
    doc: new Uint8Array(fs.readFileSync(SAMPLE_DOC_PATH)),
    'out.pdf': await d.save(),
  };
});
beforeEach(() => {
  jest.clearAllMocks();
  printHtmlToPdf = jest.fn().mockResolvedValue('out.pdf');
  deleteFiles = jest.fn().mockResolvedValue(undefined);
});

describe('convertWordToPdf', () => {
  it('converts a plain DOCX', async () => {
    const ask = jest.fn();
    const res = await convertWordToPdf(deps(ask), { uri: 'plain', name: 'a.docx' });
    expect(res).toEqual({ uri: 'out.pdf', pageCount: 2 });
    expect(printHtmlToPdf.mock.calls[0][0]).toContain(VI_TEXT);
    expect(ask).not.toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith('word.converted', expect.objectContaining({ file: 'a.docx', kind: 'docx' }));
  });

  it('converts an encrypted DOCX with the right answer', async () => {
    const ask = jest.fn().mockResolvedValue('secret');
    const res = await convertWordToPdf(deps(ask), { uri: 'enc', name: 'e.docx' });
    expect(res).toEqual({ uri: 'out.pdf', pageCount: 2 });
    expect(ask).toHaveBeenCalledWith('e.docx', false);
    expect(mockLog.info).toHaveBeenCalledWith('word.unlocked', { file: 'e.docx' });
    expect(loggedText()).not.toContain('secret');
  });

  it('asks again after a wrong password', async () => {
    const ask = jest.fn().mockResolvedValueOnce('nope').mockResolvedValueOnce('secret');
    const res = await convertWordToPdf(deps(ask), { uri: 'enc', name: 'e.docx' });
    expect(res?.pageCount).toBe(2);
    expect(ask.mock.calls).toEqual([
      ['e.docx', false],
      ['e.docx', true],
    ]);
    expect(loggedText()).not.toContain('secret');
    expect(loggedText()).not.toContain('nope');
  });

  it('returns null when skipped', async () => {
    const ask = jest.fn().mockResolvedValue(null);
    expect(await convertWordToPdf(deps(ask), { uri: 'enc', name: 'e.docx' })).toBeNull();
    expect(mockLog.info).toHaveBeenCalledWith('word.unlockSkipped', { file: 'e.docx' });
  });

  it('throws WordConvertError with the file name when no ask is available', async () => {
    await expect(convertWordToPdf(deps(), { uri: 'enc', name: 'e.docx' })).rejects.toMatchObject({
      name: 'WordConvertError',
      fileName: 'e.docx',
    });
  });

  it('rejects garbage with WordConvertError', async () => {
    const err = await convertWordToPdf(deps(), { uri: 'junk', name: 'x.docx' }).catch((e) => e);
    expect(err).toBeInstanceOf(WordConvertError);
    expect(err.fileName).toBe('x.docx');
  });

  it('wraps a print failure', async () => {
    printHtmlToPdf.mockRejectedValue(new Error('boom'));
    const err = await convertWordToPdf(deps(), { uri: 'plain', name: 'p.docx' }).catch((e) => e);
    expect(err).toBeInstanceOf(WordConvertError);
    expect(err.fileName).toBe('p.docx');
  });

  it('converts a legacy .doc', async () => {
    const res = await convertWordToPdf(deps(), { uri: 'doc', name: 'old.doc' });
    expect(res?.pageCount).toBe(2);
    expect(printHtmlToPdf.mock.calls[0][0]).toContain(SAMPLE_DOC_FIRST_LINE);
  });

  it('prompts for and converts a Standard-encrypted DOCX (real decryptOffice)', async () => {
    const ask = jest.fn().mockResolvedValue('secret');
    const res = await convertWordToPdf(deps(ask), { uri: 'stdEnc', name: 's.docx' });
    expect(ask).toHaveBeenCalledWith('s.docx', false);
    expect(res).toEqual({ uri: 'out.pdf', pageCount: 2 });
    expect(printHtmlToPdf.mock.calls[0][0]).toContain(VI_TEXT);
  });

  it('prompts for and converts an encrypted .doc', async () => {
    const plainDoc = files.doc;
    const d: WordDeps = {
      ...deps(jest.fn().mockResolvedValue('secret')),
      isOfficeEncrypted: (b) => b === plainDoc,
      decryptOffice: jest.fn(async (_b, pw) => {
        if (pw === 'secret') return plainDoc;
        throw new WordPasswordError();
      }),
    };
    const res = await convertWordToPdf(d, { uri: 'doc', name: 'old.doc' });
    expect(d.askPassword).toHaveBeenCalledWith('old.doc', false);
    expect(res?.pageCount).toBe(2);
    expect(printHtmlToPdf.mock.calls[0][0]).toContain(SAMPLE_DOC_FIRST_LINE);
  });

  it('deletes the printed PDF when it cannot be read back as a PDF', async () => {
    printHtmlToPdf.mockResolvedValue('bad.pdf');
    const d = { ...deps(), readBytes: async (u: string) => (u === 'bad.pdf' ? new Uint8Array([1, 2, 3]) : files[u]) };
    const err = await convertWordToPdf(d, { uri: 'plain', name: 'p.docx' }).catch((e) => e);
    expect(err).toBeInstanceOf(WordConvertError);
    expect(deleteFiles).toHaveBeenCalledWith(['bad.pdf']);
  });
});
