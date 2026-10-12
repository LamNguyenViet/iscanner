import { createDecipheriv, createHash } from 'crypto';
import { Document, Packer, Paragraph } from 'docx';
import { encrypt } from 'officecrypto-tool';
import { agileDecrypt, isAgileEncrypted, type AgileDeps, type HashAlg } from '../../src/convert/agileDecrypt';
import { WordConvertError, WordPasswordError } from '../../src/errors/AppError';

const hash = (alg: HashAlg, data: Uint8Array): Uint8Array =>
  new Uint8Array(createHash(alg.toLowerCase()).update(data).digest());

const deps: AgileDeps = {
  hash,
  iteratedHash: (alg, initial, spin) => {
    let h = initial;
    const it = Buffer.alloc(4);
    for (let i = 0; i < spin; i++) {
      it.writeUInt32LE(i, 0);
      h = new Uint8Array(createHash(alg.toLowerCase()).update(it).update(h).digest());
    }
    return h;
  },
  aesCbcDecrypt: (key, iv, data) => {
    const d = createDecipheriv(`aes-${key.length * 8}-cbc`, key, iv);
    d.setAutoPadding(false);
    return new Uint8Array(Buffer.concat([d.update(data), d.final()]));
  },
};

let plain: Uint8Array;
let enc: Uint8Array;

beforeAll(async () => {
  const doc = new Document({ sections: [{ children: [new Paragraph('hello agile')] }] });
  plain = new Uint8Array(await Packer.toBuffer(doc));
  enc = new Uint8Array(await encrypt(Buffer.from(plain), { password: 'secret' }));
});

test('encrypted docx is Agile', () => {
  expect(isAgileEncrypted(enc)).toBe(true);
});

test('plain docx and garbage are not Agile', () => {
  expect(isAgileEncrypted(plain)).toBe(false);
  expect(isAgileEncrypted(new Uint8Array([1, 2, 3]))).toBe(false);
});

test('decrypts with the right password to the original bytes', () => {
  const out = agileDecrypt(enc, 'secret', deps);
  expect(Buffer.from(out).equals(Buffer.from(plain))).toBe(true);
});

test('wrong password throws WordPasswordError and leaks nothing', () => {
  let err: unknown;
  try {
    agileDecrypt(enc, 'nope', deps);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(WordPasswordError);
  expect((err as Error).message).not.toContain('nope');
  expect(JSON.stringify(err)).not.toContain('nope');
  expect((err as { cause?: unknown }).cause).toBeUndefined();
});

test('garbage throws WordConvertError', () => {
  expect(() => agileDecrypt(new Uint8Array([1, 2, 3, 4]), 'x', deps)).toThrow(WordConvertError);
});

test('a plain docx throws WordConvertError', () => {
  expect(() => agileDecrypt(plain, 'x', deps)).toThrow(WordConvertError);
});

test('a spinCount above 1,000,000 throws WordConvertError', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const CFB = require('cfb');
  const cfb = CFB.read(Buffer.from(enc), { type: 'buffer' });
  const entry = CFB.find(cfb, '/EncryptionInfo');
  const xml = Buffer.from(entry.content).toString('latin1').replace(/spinCount="\d+"/, 'spinCount="1000001"');
  entry.content = Buffer.from(xml, 'latin1');
  entry.size = entry.content.length;
  const tampered = new Uint8Array(CFB.write(cfb, { type: 'buffer' }));
  expect(() => agileDecrypt(tampered, 'secret', deps)).toThrow(WordConvertError);
});
