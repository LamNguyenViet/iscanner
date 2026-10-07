import { Directory, File, Paths } from 'expo-file-system';
import type { FsAdapter } from './types';

const file = (path: string) => new File(Paths.document, path);

/**
 * Writes to a sibling temp file, then moves it over the target (overwrite),
 * so a failed write never destroys the previous content.
 */
function atomicWrite(path: string, content: string | Uint8Array): void {
  const tmp = file(`${path}.tmp`);
  try {
    tmp.create({ intermediates: true, overwrite: true });
    tmp.write(content);
    tmp.moveSync(file(path), { overwrite: true });
  } catch (error) {
    try {
      if (tmp.exists) tmp.delete();
    } catch {
      // best-effort cleanup
    }
    throw error;
  }
}

export const expoFs: FsAdapter = {
  async readText(path) {
    const f = file(path);
    return f.exists ? await f.text() : null;
  },
  async writeText(path, text) {
    atomicWrite(path, text);
  },
  async writeBytes(path, bytes) {
    atomicWrite(path, bytes);
  },
  async readBytes(path) {
    return await file(path).bytes();
  },
  async delete(path) {
    const f = file(path);
    if (f.exists) f.delete();
  },
  async ensureDir(path) {
    new Directory(Paths.document, path).create({ intermediates: true, idempotent: true });
  },
  async list(dir) {
    const d = new Directory(Paths.document, dir);
    if (!d.exists) return [];
    return d.list().filter((e) => e instanceof File).map((e) => e.name);
  },
  async append(path, text) {
    const f = file(path);
    if (!f.exists) f.create({ intermediates: true });
    f.write(text, { append: true });
  },
  uri(path) {
    return file(path).uri;
  },
};
