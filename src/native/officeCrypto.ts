import { WordConvertError, WordPasswordError } from '../errors/AppError';

// officecrypto-tool (and its deps) expect a global Buffer; Hermes has none.
// eslint-disable-next-line @typescript-eslint/no-require-imports
(global as { Buffer?: unknown }).Buffer ??= require('buffer').Buffer;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const officeCrypto = require('officecrypto-tool') as {
  isEncrypted(input: Uint8Array): boolean;
  decrypt(input: Uint8Array, options: { password: string }): Promise<Uint8Array>;
};

/** True for password-protected Office (CFB-wrapped) files. False on any parse error. */
export function isOfficeEncrypted(bytes: Uint8Array): boolean {
  try {
    return officeCrypto.isEncrypted(bytes as never) === true;
  } catch {
    return false;
  }
}

/** Decrypts a protected Office file. The password is never put into an error. */
export async function decryptOffice(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  try {
    const out = await officeCrypto.decrypt(bytes as never, { password });
    return new Uint8Array(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (/password is incorrect/i.test(msg)) throw new WordPasswordError();
    throw new WordConvertError({ cause: e });
  }
}
