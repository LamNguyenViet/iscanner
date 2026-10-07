import type { FsAdapter } from './types';

export function createMemoryFs(): FsAdapter & {
  files: Map<string, string | Uint8Array>;
  failNextWrite(path: string): void;
  failNextAppend(path: string): void;
  failNextRead(path: string): void;
  failNextSize(path: string): void;
} {
  const files = new Map<string, string | Uint8Array>();
  const failing = new Set<string>();
  const failingAppend = new Set<string>();
  const failingRead = new Set<string>();
  const failingSize = new Set<string>();

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
    failNextAppend(path) {
      failingAppend.add(path);
    },
    failNextRead(path) {
      failingRead.add(path);
    },
    failNextSize(path) {
      failingSize.add(path);
    },
    async size(path) {
      if (failingSize.delete(path)) {
        throw new Error(`Simulated size failure: ${path}`);
      }
      const value = files.get(path);
      if (value === undefined) return null;
      return typeof value === 'string' ? new TextEncoder().encode(value).length : value.byteLength;
    },
    async list(dir) {
      const prefix = dir.endsWith('/') ? dir : `${dir}/`;
      const names: string[] = [];
      for (const key of files.keys()) {
        if (key.startsWith(prefix) && !key.slice(prefix.length).includes('/')) {
          names.push(key.slice(prefix.length));
        }
      }
      return names;
    },
    async append(path, text) {
      if (failingAppend.delete(path)) {
        throw new Error(`Simulated append failure: ${path}`);
      }
      const prev = files.get(path);
      files.set(path, (typeof prev === 'string' ? prev : '') + text);
    },
    async readText(path) {
      if (failingRead.delete(path)) {
        throw new Error(`Simulated read failure: ${path}`);
      }
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
