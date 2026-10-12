import { createDecipheriv, createHash, randomBytes } from 'crypto';
import { makeDocx, makeEncryptedDocx, makeStandardEncryptedDocx } from '../fixtures/word';
import {
  aesEcbDecrypt,
  isStandardEncrypted,
  standardDecrypt,
} from '../../src/convert/standardDecrypt';
import type { AgileDeps, HashAlg } from '../../src/convert/agileDecrypt';
import { WordConvertError, WordPasswordError } from '../../src/errors/AppError';

const deps: AgileDeps = {
  hash: (alg: HashAlg, data) =>
    new Uint8Array(createHash(alg.toLowerCase()).update(data).digest()),
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

let std: Uint8Array;
let plain: Uint8Array;

beforeAll(async () => {
  plain = await makeDocx();
  std = await makeStandardEncryptedDocx('secret');
});

test('detects Standard encryption only', async () => {
  expect(isStandardEncrypted(std)).toBe(true);
  expect(isStandardEncrypted(await makeEncryptedDocx('secret'))).toBe(false);
  expect(isStandardEncrypted(plain)).toBe(false);
  expect(isStandardEncrypted(new Uint8Array([1, 2, 3]))).toBe(false);
});

test('decrypts with the right password', () => {
  const out = standardDecrypt(std, 'secret', deps);
  expect(out[0]).toBe(0x50);
  expect(out[1]).toBe(0x4b);
});

test('wrong and empty passwords throw WordPasswordError without leaking', () => {
  for (const pw of ['nope', '']) {
    let err: unknown;
    try {
      standardDecrypt(std, pw, deps);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(WordPasswordError);
    expect(JSON.stringify(err)).not.toContain('nope');
  }
});

test('truncated or garbage input throws WordConvertError', () => {
  expect(() => standardDecrypt(std.slice(0, 700), 'secret', deps)).toThrow(WordConvertError);
  expect(() => standardDecrypt(new Uint8Array([1, 2, 3, 4]), 'secret', deps)).toThrow(
    WordConvertError,
  );
});

test('AES-ECB via the CBC dep matches Node ECB', () => {
  for (const bits of [128, 192, 256]) {
    const key = randomBytes(bits / 8);
    const data = randomBytes(48);
    const d = createDecipheriv(`aes-${bits}-ecb`, key, null);
    d.setAutoPadding(false);
    const expected = Buffer.concat([d.update(data), d.final()]);
    const out = aesEcbDecrypt(deps.aesCbcDecrypt, key, new Uint8Array(data));
    expect(Buffer.from(out).equals(expected)).toBe(true);
  }
});
