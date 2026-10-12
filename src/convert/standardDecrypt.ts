import { WordConvertError, WordPasswordError } from '../errors/AppError';
import {
  concat,
  equal,
  le32,
  readStreams,
  readUInt64LE,
  utf16le,
  type AgileDeps,
} from './agileDecrypt';

/**
 * ECMA-376 Standard decryption (MS-OFFCRYPTO 2.3.4.5-2.3.4.9) for password-protected DOCX.
 * Pure: AES-ECB is built on the injected AES-CBC primitive (react-native-quick-crypto
 * rejects aes-*-ecb), and the 50,000-round SHA-1 spin is injected so it can run natively.
 */

const SPIN = 50000;
const HASH_LEN = 20;

function isStandardVersion(info: Uint8Array): boolean {
  if (info.length < 8) return false;
  const major = info[0] | (info[1] << 8);
  const minor = info[2] | (info[3] << 8);
  return major >= 2 && major <= 4 && minor === 2;
}

/** True for a CFB whose EncryptionInfo stream is version 2/3/4.2 (Standard). False on any parse error. */
export function isStandardEncrypted(bytes: Uint8Array): boolean {
  try {
    const s = readStreams(bytes);
    return s !== null && isStandardVersion(s.info);
  } catch {
    return false;
  }
}

/** Decrypts a Standard-encrypted DOCX. The password never reaches an error. */
export function standardDecrypt(bytes: Uint8Array, password: string, deps: AgileDeps): Uint8Array {
  try {
    return decrypt(bytes, password, deps);
  } catch (e) {
    if (e instanceof WordPasswordError) throw e;
    throw new WordConvertError({ cause: e });
  }
}

/**
 * AES-ECB decrypt using a no-padding AES-CBC primitive with a zero IV:
 * CBC gives P_i = D(C_i) ^ C_{i-1}, so XOR-ing the previous ciphertext block back in yields D(C_i).
 */
export function aesEcbDecrypt(
  cbc: AgileDeps['aesCbcDecrypt'],
  key: Uint8Array,
  data: Uint8Array,
): Uint8Array {
  if (data.length % 16 !== 0) throw new Error('ECB input is not block aligned');
  const out = cbc(key, new Uint8Array(16), data).slice();
  for (let i = 16; i < data.length; i++) out[i] ^= data[i - 16];
  return out;
}

function u32(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

function decrypt(bytes: Uint8Array, password: string, deps: AgileDeps): Uint8Array {
  const streams = readStreams(bytes);
  if (!streams || !isStandardVersion(streams.info)) throw new Error('not a Standard-encrypted file');
  if (!streams.pkg) throw new Error('missing EncryptedPackage');
  const info = streams.info;

  // uint16 major, uint16 minor, uint32 flags, uint32 headerSize, header, verifier.
  if (info.length < 12) throw new Error('EncryptionInfo too short');
  const headerSize = u32(info, 8);
  if (headerSize < 32 || 12 + headerSize > info.length) throw new Error('bad header size');
  const keyBits = u32(info, 12 + 16);
  if (keyBits !== 128 && keyBits !== 192 && keyBits !== 256) throw new Error('unsupported key size');
  const keyLen = keyBits / 8;

  const v = 12 + headerSize;
  if (info.length < v + 4) throw new Error('missing verifier');
  const saltSize = u32(info, v);
  if (saltSize !== 16) throw new Error('bad salt size');
  if (info.length < v + 4 + 16 + 16 + 4 + 32) throw new Error('verifier truncated');
  const salt = info.slice(v + 4, v + 20);
  const encVerifier = info.slice(v + 20, v + 36);
  const verifierHashSize = u32(info, v + 36);
  if (verifierHashSize !== HASH_LEN) throw new Error('bad verifier hash size');
  const encVerifierHash = info.slice(v + 40, v + 72);

  // Password -> key
  const h0 = deps.hash('SHA1', concat(salt, utf16le(password)));
  const hn = deps.iteratedHash('SHA1', h0, SPIN);
  const hfinal = deps.hash('SHA1', concat(hn, le32(0)));
  const pad = (fill: number) => {
    const buf = new Uint8Array(64).fill(fill);
    for (let i = 0; i < hfinal.length; i++) buf[i] ^= hfinal[i];
    return deps.hash('SHA1', buf);
  };
  const key = concat(pad(0x36), pad(0x5c)).slice(0, keyLen);

  // Verifier
  const verifier = aesEcbDecrypt(deps.aesCbcDecrypt, key, encVerifier);
  const vh = aesEcbDecrypt(deps.aesCbcDecrypt, key, encVerifierHash).subarray(0, HASH_LEN);
  if (!equal(deps.hash('SHA1', verifier), vh)) throw new WordPasswordError();

  // EncryptedPackage: uint64 LE size, then the AES-ECB body.
  const pkg = streams.pkg;
  if (pkg.length < 8) throw new Error('EncryptedPackage too short');
  const total = readUInt64LE(pkg);
  const body = pkg.subarray(8);
  if (total > body.length) throw new Error('EncryptedPackage size exceeds the stream');
  let data = body;
  if (data.length % 16 !== 0) {
    data = new Uint8Array(Math.ceil(body.length / 16) * 16);
    data.set(body);
  }
  return aesEcbDecrypt(deps.aesCbcDecrypt, key, data).slice(0, total);
}
