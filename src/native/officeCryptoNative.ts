import { Buffer } from 'buffer';
import OfficeCrypto from '../../modules/office-crypto';
import type { HashAlg } from '../convert/agileDecrypt';

/** h = initial; for i in 0 until spinCount: h = HASH(le32(i) || h), run natively in one call. */
export function nativeIteratedHash(algorithm: HashAlg, initial: Uint8Array, spinCount: number): Uint8Array {
  const out = OfficeCrypto.iteratedHash(algorithm, Buffer.from(initial).toString('base64'), spinCount);
  return new Uint8Array(Buffer.from(out, 'base64'));
}
