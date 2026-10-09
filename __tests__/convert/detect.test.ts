import fs from 'fs';
import JSZip from 'jszip';
import { detectWordKind } from '../../src/convert/detect';
import { makeDocx, makeEncryptedDocx, SAMPLE_DOC_PATH } from '../fixtures/word';
import { makePng } from '../fixtures/images';

test('plain docx', async () => {
  expect(detectWordKind(await makeDocx())).toBe('docx');
});

test('encrypted docx', async () => {
  expect(detectWordKind(await makeEncryptedDocx())).toBe('docx-encrypted');
});

test('legacy doc', () => {
  expect(detectWordKind(new Uint8Array(fs.readFileSync(SAMPLE_DOC_PATH)))).toBe('doc');
});

test('pdf, png, other zip, junk and empty are not Word', async () => {
  const pdf = new Uint8Array(Buffer.from('%PDF-1.4\n1 0 obj\n'));
  expect(detectWordKind(pdf)).toBeNull();
  expect(detectWordKind(makePng(4, 4))).toBeNull();
  const zip = new JSZip();
  zip.file('xl/workbook.xml', '<workbook/>');
  expect(detectWordKind(new Uint8Array(await zip.generateAsync({ type: 'uint8array' })))).toBeNull();
  expect(detectWordKind(new Uint8Array([1, 2, 3]))).toBeNull();
  expect(detectWordKind(new Uint8Array(0))).toBeNull();
});
