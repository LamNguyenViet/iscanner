import { Directory, File, Paths } from 'expo-file-system';
import type { FsAdapter } from './types';

const file = (path: string) => new File(Paths.document, path);

export const expoFs: FsAdapter = {
  async readText(path) {
    const f = file(path);
    return f.exists ? await f.text() : null;
  },
  async writeText(path, text) {
    const f = file(path);
    f.create({ intermediates: true, overwrite: true });
    f.write(text);
  },
  async writeBytes(path, bytes) {
    const f = file(path);
    f.create({ intermediates: true, overwrite: true });
    f.write(bytes);
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
  uri(path) {
    return file(path).uri;
  },
};
