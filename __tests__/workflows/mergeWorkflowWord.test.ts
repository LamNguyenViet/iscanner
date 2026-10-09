import fs from 'fs';
import JSZip from 'jszip';
import { PDFDocument } from '../../src/pdf/pdfLib';
import { loadPickedFiles, loadPickedPdfs } from '../../src/workflows/mergeWorkflow';
import { decryptOffice, isOfficeEncrypted } from '../../src/native/officeCrypto';
import { makeDocx, makeEncryptedDocx, SAMPLE_DOC_PATH } from '../fixtures/word';

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

let files: Record<string, Uint8Array>;
let printHtmlToPdf: jest.Mock;
const readBytes = async (uri: string) => files[uri];
const word = () => ({ printHtmlToPdf, decryptOffice, isOfficeEncrypted });

async function pdfOfPages(n: number): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  for (let i = 0; i < n; i++) d.addPage([100, 100]);
  return d.save();
}

beforeAll(async () => {
  const xlsx = new JSZip();
  xlsx.file('xl/workbook.xml', '<x/>');
  files = {
    pdf: await pdfOfPages(1),
    docx: await makeDocx(),
    enc: await makeEncryptedDocx('secret'),
    enc2: await makeEncryptedDocx('other'),
    doc: new Uint8Array(fs.readFileSync(SAMPLE_DOC_PATH)),
    xlsx: new Uint8Array(await xlsx.generateAsync({ type: 'uint8array' })),
    junk: new Uint8Array([1, 2, 3, 4, 5]),
    'out.pdf': await pdfOfPages(2),
  };
});
beforeEach(() => {
  jest.clearAllMocks();
  printHtmlToPdf = jest.fn().mockResolvedValue('out.pdf');
});

describe('loadPickedFiles with Word', () => {
  it('loads a PDF and a plain DOCX; the Word row points at the converted PDF', async () => {
    const res = await loadPickedFiles({ readBytes, word: word() }, [
      { uri: 'pdf', name: 'a.pdf' },
      { uri: 'docx', name: 'b.docx' },
    ]);
    expect(res.loaded).toEqual([
      { uri: 'pdf', name: 'a.pdf', pageCount: 1 },
      { uri: 'out.pdf', name: 'b.docx', pageCount: 2 },
    ]);
    expect(res.converted).toEqual(['out.pdf']);
    expect(res.failed).toEqual([]);
  });

  it('converts a legacy DOC', async () => {
    const res = await loadPickedFiles({ readBytes, word: word() }, [{ uri: 'doc', name: 'old.doc' }]);
    expect(res.loaded).toHaveLength(1);
    expect(res.converted).toEqual(['out.pdf']);
  });

  it('wrong then right password, then a skipped encrypted DOCX', async () => {
    const askPassword = jest
      .fn()
      .mockResolvedValueOnce('nope')
      .mockResolvedValueOnce('secret')
      .mockResolvedValueOnce(null);
    const res = await loadPickedFiles({ readBytes, askPassword, word: word() }, [
      { uri: 'enc', name: 'e.docx' },
      { uri: 'enc2', name: 'e2.docx' },
    ]);
    expect(res.loaded).toHaveLength(1);
    expect(res.loaded[0].password).toBeUndefined();
    expect(res.skipped).toEqual(['e2.docx']);
    expect(res.failed).toEqual([]);
  });

  it('a PDF named fake.docx loads as a PDF and converts nothing', async () => {
    const res = await loadPickedFiles({ readBytes, word: word() }, [{ uri: 'pdf', name: 'fake.docx' }]);
    expect(res.loaded).toEqual([{ uri: 'pdf', name: 'fake.docx', pageCount: 1 }]);
    expect(res.converted).toEqual([]);
    expect(printHtmlToPdf).not.toHaveBeenCalled();
  });

  it('an xlsx is a WORD_CONVERT failure with its file name', async () => {
    const res = await loadPickedFiles({ readBytes, word: word() }, [{ uri: 'xlsx', name: 'sheet.xlsx' }]);
    expect(res.failed[0].code).toBe('WORD_CONVERT');
    expect(res.failed[0].fileName).toBe('sheet.xlsx');
    expect(res.loaded).toEqual([]);
  });

  it('without word deps a Word file is a WORD_CONVERT failure', async () => {
    const res = await loadPickedFiles({ readBytes }, [{ uri: 'docx', name: 'b.docx' }]);
    expect(res.failed[0].code).toBe('WORD_CONVERT');
    const alias = await loadPickedPdfs({ readBytes }, [{ uri: 'docx', name: 'b.docx' }]);
    expect(alias.failed[0].code).toBe('WORD_CONVERT');
  });

  it('garbage stays PDF_LOAD', async () => {
    const res = await loadPickedFiles({ readBytes, word: word() }, [{ uri: 'junk', name: 'j.pdf' }]);
    expect(res.failed[0].code).toBe('PDF_LOAD');
  });
});
