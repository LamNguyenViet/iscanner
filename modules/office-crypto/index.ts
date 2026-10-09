import { NativeModule, requireNativeModule } from 'expo';

export type OfficeHashAlgorithm = 'SHA1' | 'SHA256' | 'SHA384' | 'SHA512';

declare class OfficeCryptoModule extends NativeModule<{}> {
  /**
   * Synchronous: h = initial; for i in 0 until spinCount: h = HASH(le32(i) || h).
   * Takes and returns base64. Throws on an unknown algorithm.
   */
  iteratedHash(algorithm: OfficeHashAlgorithm, initialBase64: string, spinCount: number): string;
}

export default requireNativeModule<OfficeCryptoModule>('OfficeCrypto');
