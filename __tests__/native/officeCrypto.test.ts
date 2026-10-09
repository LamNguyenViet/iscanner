import { Document, Packer, Paragraph } from 'docx';
import { encrypt } from 'officecrypto-tool';
import { decryptOffice, isOfficeEncrypted } from '../../src/native/officeCrypto';
import { WordConvertError, WordPasswordError } from '../../src/errors/AppError';
import { nativeIteratedHash } from '../../src/native/officeCryptoNative';

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

const mockedHash = nativeIteratedHash as jest.MockedFunction<typeof nativeIteratedHash>;

beforeEach(() => mockedHash.mockClear());

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

test('Agile input runs the spin loop natively, once, with spinCount 100000', async () => {
  const out = await decryptOffice(enc, 'secret');
  expect(Buffer.from(out).equals(Buffer.from(plain))).toBe(true);
  expect(mockedHash).toHaveBeenCalledTimes(1);
  expect(mockedHash.mock.calls[0][0]).toBe('SHA512');
  expect(mockedHash.mock.calls[0][2]).toBe(100000);
});
