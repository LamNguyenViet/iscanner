import { Document, Packer, Paragraph } from 'docx';
import { encrypt } from 'officecrypto-tool';
import { decryptOffice, isOfficeEncrypted } from '../../src/native/officeCrypto';
import { WordConvertError, WordPasswordError } from '../../src/errors/AppError';

let plain: Uint8Array;
let enc: Uint8Array;

beforeAll(async () => {
  const doc = new Document({ sections: [{ children: [new Paragraph('hello')] }] });
  plain = new Uint8Array(await Packer.toBuffer(doc));
  enc = new Uint8Array(await encrypt(Buffer.from(plain), { password: 'secret' }));
});

test('plain docx is not encrypted', () => {
  expect(isOfficeEncrypted(plain)).toBe(false);
});

test('garbage is not reported as encrypted', () => {
  expect(isOfficeEncrypted(new Uint8Array([1, 2, 3]))).toBe(false);
});

test('encrypted docx is detected', () => {
  expect(isOfficeEncrypted(enc)).toBe(true);
});

test('decrypts with the right password', async () => {
  const out = await decryptOffice(enc, 'secret');
  expect(Buffer.from(out).equals(Buffer.from(plain))).toBe(true);
});

test('wrong password rejects with WordPasswordError and leaks nothing', async () => {
  const err = await decryptOffice(enc, 'nope').catch((e) => e);
  expect(err).toBeInstanceOf(WordPasswordError);
  expect(err.message).not.toContain('nope');
  expect(JSON.stringify(err)).not.toContain('nope');
});

test('garbage rejects with WordConvertError', async () => {
  await expect(decryptOffice(new Uint8Array([1, 2, 3, 4]), 'x')).rejects.toBeInstanceOf(WordConvertError);
});
