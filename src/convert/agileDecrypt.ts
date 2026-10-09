import * as CFB from 'cfb';
import { WordConvertError, WordPasswordError } from '../errors/AppError';

/**
 * ECMA-376 Agile decryption (MS-OFFCRYPTO 2.3.4.10-2.3.4.15) for password-protected DOCX.
 * Pure: the hashing and AES primitives are injected, so the 100k-iteration spin loop
 * can run natively in one call.
 */

export type HashAlg = 'SHA1' | 'SHA256' | 'SHA384' | 'SHA512';

export type AgileDeps = {
  /** h = initial; for i in 0 until spin: h = HASH(le32(i) || h) */
  iteratedHash: (alg: HashAlg, initial: Uint8Array, spin: number) => Uint8Array;
  hash: (alg: HashAlg, data: Uint8Array) => Uint8Array;
  /** AES-CBC decrypt without padding; the cipher size follows the key length. */
  aesCbcDecrypt: (key: Uint8Array, iv: Uint8Array, data: Uint8Array) => Uint8Array;
};

const BK_VERIFIER_INPUT = new Uint8Array([0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79]);
const BK_VERIFIER_HASH = new Uint8Array([0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e]);
const BK_KEY_VALUE = new Uint8Array([0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6]);

const SEGMENT = 4096;
const HASH_ALGS: readonly HashAlg[] = ['SHA1', 'SHA256', 'SHA384', 'SHA512'];
const MAX_SPIN = 10_000_000;

type Streams = { info: Uint8Array; pkg: Uint8Array | null };

function readStreams(bytes: Uint8Array): Streams | null {
  const cfb = CFB.read(bytes, { type: 'array' });
  const info = CFB.find(cfb, '/EncryptionInfo');
  if (!info || !info.content) return null;
  const pkg = CFB.find(cfb, '/EncryptedPackage');
  return {
    info: Uint8Array.from(info.content as ArrayLike<number>),
    pkg: pkg && pkg.content ? Uint8Array.from(pkg.content as ArrayLike<number>) : null,
  };
}

function isAgileVersion(info: Uint8Array): boolean {
  return info.length >= 8 && info[0] === 4 && info[1] === 0 && info[2] === 4 && info[3] === 0;
}

/** True for a CFB whose EncryptionInfo stream is version 4.4 (Agile). False on any parse error. */
export function isAgileEncrypted(bytes: Uint8Array): boolean {
  try {
    const s = readStreams(bytes);
    return s !== null && isAgileVersion(s.info);
  } catch {
    return false;
  }
}

/** Decrypts an Agile-encrypted DOCX. The password never reaches an error. */
export function agileDecrypt(bytes: Uint8Array, password: string, deps: AgileDeps): Uint8Array {
  try {
    return decrypt(bytes, password, deps);
  } catch (e) {
    if (e instanceof WordPasswordError) throw e;
    throw new WordConvertError({ cause: e });
  }
}

function decrypt(bytes: Uint8Array, password: string, deps: AgileDeps): Uint8Array {
  const streams = readStreams(bytes);
  if (!streams || !isAgileVersion(streams.info)) throw new Error('not an Agile-encrypted file');
  if (!streams.pkg) throw new Error('missing EncryptedPackage');

  // uint16 major, uint16 minor, uint32 flags, then the XML descriptor.
  const xml = latin1(streams.info.subarray(8));
  const keyData = tag(xml, 'keyData');
  const encKey = tag(xml, 'encryptedKey');

  const kdSalt = b64(attr(keyData, 'saltValue'));
  const kdAlg = hashAlg(attr(keyData, 'hashAlgorithm'));
  const blockSize = int(attr(keyData, 'blockSize'), 2, SEGMENT);
  const kdKeyBits = keyBits(attr(keyData, 'keyBits'));

  const spinCount = int(attr(encKey, 'spinCount'), 0, MAX_SPIN);
  const ekSalt = b64(attr(encKey, 'saltValue'));
  const ekAlg = hashAlg(attr(encKey, 'hashAlgorithm'));
  const ekKeyBits = keyBits(attr(encKey, 'keyBits'));
  const encVerifierInput = b64(attr(encKey, 'encryptedVerifierHashInput'));
  const encVerifierHash = b64(attr(encKey, 'encryptedVerifierHashValue'));
  const encKeyValue = b64(attr(encKey, 'encryptedKeyValue'));

  // Password -> Hn
  const h0 = deps.hash(ekAlg, concat(ekSalt, utf16le(password)));
  const hn = deps.iteratedHash(ekAlg, h0, spinCount);
  const deriveKey = (blockKey: Uint8Array) =>
    fit(deps.hash(ekAlg, concat(hn, blockKey)), ekKeyBits / 8);

  // Verifier
  const vin = deps
    .aesCbcDecrypt(deriveKey(BK_VERIFIER_INPUT), ekSalt, encVerifierInput)
    .subarray(0, ekSalt.length);
  const vh = deps.aesCbcDecrypt(deriveKey(BK_VERIFIER_HASH), ekSalt, encVerifierHash);
  const expected = deps.hash(ekAlg, vin);
  if (vh.length < expected.length || !equal(expected, vh.subarray(0, expected.length))) {
    throw new WordPasswordError();
  }

  // Package key
  const keyValue = deps.aesCbcDecrypt(deriveKey(BK_KEY_VALUE), ekSalt, encKeyValue);
  if (keyValue.length < kdKeyBits / 8) throw new Error('encryptedKeyValue too short');
  const secretKey = keyValue.slice(0, kdKeyBits / 8);

  // EncryptedPackage: uint64 LE size, then 4096-byte segments.
  const pkg = streams.pkg;
  if (pkg.length < 8) throw new Error('EncryptedPackage too short');
  const total = readUInt64LE(pkg);
  const body = pkg.subarray(8);
  if (total > body.length) throw new Error('EncryptedPackage size exceeds the stream');

  const out = new Uint8Array(Math.ceil(body.length / 16) * 16);
  let written = 0;
  for (let i = 0, off = 0; off < body.length; i++, off += SEGMENT) {
    let seg = body.subarray(off, Math.min(off + SEGMENT, body.length));
    if (seg.length % 16 !== 0) {
      const padded = new Uint8Array(Math.ceil(seg.length / 16) * 16);
      padded.set(seg);
      seg = padded;
    }
    const iv = fit(deps.hash(kdAlg, concat(kdSalt, le32(i))), blockSize);
    const plain = deps.aesCbcDecrypt(secretKey, iv, seg);
    out.set(plain, written);
    written += plain.length;
  }
  return out.slice(0, total);
}

// ---- helpers ---------------------------------------------------------------

function tag(xml: string, name: string): string {
  const m = new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>`).exec(xml);
  if (!m) throw new Error(`missing <${name}>`);
  return m[0];
}

function attr(element: string, name: string): string {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(element);
  if (!m) throw new Error(`missing attribute ${name}`);
  return (m[1] ?? m[2]).trim();
}

function hashAlg(value: string): HashAlg {
  const v = value.toUpperCase().replace('-', '') as HashAlg;
  if (!HASH_ALGS.includes(v)) throw new Error(`unsupported hash algorithm ${value}`);
  return v;
}

function int(value: string, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`bad integer ${value}`);
  return n;
}

function keyBits(value: string): number {
  const n = int(value, 128, 256);
  if (n !== 128 && n !== 192 && n !== 256) throw new Error(`unsupported key size ${value}`);
  return n;
}

/** Truncate to `len`, or pad with 0x36 up to `len`. */
function fit(data: Uint8Array, len: number): Uint8Array {
  if (data.length >= len) return data.slice(0, len);
  const out = new Uint8Array(len).fill(0x36);
  out.set(data);
  return out;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function le32(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
}

function readUInt64LE(b: Uint8Array): number {
  const lo = (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
  const hi = (b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] << 24)) >>> 0;
  return hi * 0x1_0000_0000 + lo;
}

function utf16le(s: string): Uint8Array {
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[i * 2] = c & 0xff;
    out[i * 2 + 1] = c >>> 8;
  }
  return out;
}

function latin1(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 8192) {
    s += String.fromCharCode(...b.subarray(i, i + 8192));
  }
  return s;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function b64(s: string): Uint8Array {
  const clean = s.replace(/[\s=]/g, '');
  if (clean.length === 0 || /[^A-Za-z0-9+/]/.test(clean) || clean.length % 4 === 1) {
    throw new Error('bad base64');
  }
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let acc = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    acc = ((acc << 6) | B64.indexOf(clean[i])) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >>> bits) & 0xff;
    }
  }
  return out;
}
