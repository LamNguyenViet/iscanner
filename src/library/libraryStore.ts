import { defaultName, sanitizeName } from '../utils/format';
import { vi } from '../i18n/vi';
import type { DocumentMeta, FsAdapter, LibraryStore } from './types';

const INDEX_PATH = 'library.json';
const BACKUP_PATH = 'library.json.bak';
const PDF_DIR = 'pdfs';

const defaultNewId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function createLibraryStore(deps: {
  fs: FsAdapter;
  now?: () => Date;
  newId?: () => string;
}): LibraryStore {
  const { fs } = deps;
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? defaultNewId;

  async function readIndex(): Promise<DocumentMeta[]> {
    const raw = await fs.readText(INDEX_PATH);
    if (raw === null) return [];
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1 && Array.isArray(parsed.documents)) {
        return parsed.documents as DocumentMeta[];
      }
    } catch {
      // fall through to recovery
    }
    await fs.writeText(BACKUP_PATH, raw);
    return [];
  }

  async function writeIndex(documents: DocumentMeta[]): Promise<void> {
    await fs.writeText(INDEX_PATH, JSON.stringify({ version: 1, documents }));
  }

  return {
    list: readIndex,

    async get(id) {
      return (await readIndex()).find((d) => d.id === id);
    },

    async add(bytes, input) {
      const documents = await readIndex();
      const created = now();
      const id = newId();
      const fileName = `${id}.pdf`;
      const path = `${PDF_DIR}/${fileName}`;
      const meta: DocumentMeta = {
        id,
        name: sanitizeName(input.name, defaultName(input.source, created, vi)),
        fileName,
        createdAt: created.toISOString(),
        pageCount: input.pageCount,
        sizeBytes: bytes.byteLength,
        source: input.source,
      };

      await fs.ensureDir(PDF_DIR);
      await fs.writeBytes(path, bytes);
      try {
        await writeIndex([meta, ...documents]);
      } catch (error) {
        await fs.delete(path).catch(() => {});
        throw error;
      }
      return meta;
    },

    async rename(id, name) {
      const documents = await readIndex();
      const current = documents.find((d) => d.id === id);
      if (!current) throw new Error('NOT_FOUND');
      const updated = { ...current, name: sanitizeName(name, current.name) };
      await writeIndex(documents.map((d) => (d.id === id ? updated : d)));
      return updated;
    },

    async remove(id) {
      const documents = await readIndex();
      const target = documents.find((d) => d.id === id);
      if (!target) return;
      await writeIndex(documents.filter((d) => d.id !== id));
      await fs.delete(`${PDF_DIR}/${target.fileName}`);
    },

    fileUri(meta) {
      return fs.uri(`${PDF_DIR}/${meta.fileName}`);
    },
  };
}
