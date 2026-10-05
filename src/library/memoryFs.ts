import type { FsAdapter } from './types';

export function createMemoryFs(): FsAdapter & {
  files: Map<string, string | Uint8Array>;
  failNextWrite(path: string): void;
} {
  const files = new Map<string, string | Uint8Array>();
  const failing = new Set<string>();

  const checkFail = (path: string) => {
    if (failing.delete(path)) {
      throw new Error(`Simulated write failure: ${path}`);
    }
  };

  return {
    files,
    failNextWrite(path) {
      failing.add(path);
    },
    async readText(path) {
      const value = files.get(path);
      return typeof value === 'string' ? value : null;
    },
    async writeText(path, text) {
      checkFail(path);
      files.set(path, text);
    },
    async writeBytes(path, bytes) {
      checkFail(path);
      files.set(path, bytes);
    },
    async readBytes(path) {
      const value = files.get(path);
      if (!(value instanceof Uint8Array)) {
        throw new Error(`File not found: ${path}`);
      }
      return value;
    },
    async delete(path) {
      files.delete(path);
    },
    async ensureDir() {},
    uri(path) {
      return `file:///memory/${path}`;
    },
  };
}
