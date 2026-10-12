import { createDecipheriv, createHash } from 'crypto';
import { agileDecrypt, isAgileEncrypted, type AgileDeps, type HashAlg } from '../convert/agileDecrypt';
import { WordConvertError, WordPasswordError } from '../errors/AppError';
import { nativeIteratedHash } from './officeCryptoNative';

// officecrypto-tool (and its deps) expect a global Buffer; Hermes has none.
// eslint-disable-next-line @typescript-eslint/no-require-imports
(global as { Buffer?: unknown }).Buffer ??= require('buffer').Buffer;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const officeCrypto = require('officecrypto-tool') as {
  isEncrypted(input: Uint8Array): boolean;
  decrypt(input: Uint8Array, options: { password: string }): Promise<Uint8Array>;
};

// Under Metro `crypto` resolves to react-native-quick-crypto; under Jest, to Node.
const agileDeps: AgileDeps = {
  iteratedHash: nativeIteratedHash,
  hash: (alg: HashAlg, data: Uint8Array) =>
    new Uint8Array(createHash(alg.toLowerCase()).update(data).digest()),
  aesCbcDecrypt: (key: Uint8Array, iv: Uint8Array, data: Uint8Array) => {
    const decipher = createDecipheriv(`aes-${key.length * 8}-cbc`, key, iv);
    decipher.setAutoPadding(false);
    const head = decipher.update(data);
    const tail = decipher.final();
    const out = new Uint8Array(head.length + tail.length);
    out.set(head, 0);
    out.set(tail, head.length);
    return out;
  },
};

/** True for password-protected Office (CFB-wrapped) files. False on any parse error. */
export function isOfficeEncrypted(bytes: Uint8Array): boolean {
  try {
    return officeCrypto.isEncrypted(bytes as never) === true;
  } catch {
    return false;
  }
}

/**
 * Decrypts a protected Office file. The password is never put into an error.
 * ECMA-376 Agile (modern DOCX) goes through our decryptor with a native spin loop;
 * Standard encryption and .doc RC4 / RC4 CryptoAPI go through officecrypto-tool.
 */
export async function decryptOffice(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  if (isAgileEncrypted(bytes)) return agileDecrypt(bytes, password, agileDeps);
  // officecrypto-tool throws a generic error on an empty password; treat it as "needs a password".
  if (password === '') throw new WordPasswordError();
  try {
    const out = await officeCrypto.decrypt(bytes as never, { password });
    return new Uint8Array(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (/password is (incorrect|required)/i.test(msg)) throw new WordPasswordError();
    throw new WordConvertError({ cause: e });
  }
}
