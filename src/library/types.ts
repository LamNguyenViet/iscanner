export type DocumentSource = 'scan' | 'merge';

export type DocumentMeta = {
  id: string;
  name: string;
  fileName: string;
  createdAt: string;
  pageCount: number;
  sizeBytes: number;
  source: DocumentSource;
};

export interface FsAdapter {
  /** Returns null if the file is missing. */
  readText(path: string): Promise<string | null>;
  writeText(path: string, text: string): Promise<void>;
  writeBytes(path: string, bytes: Uint8Array): Promise<void>;
  readBytes(path: string): Promise<Uint8Array>;
  /** No-op if the file is missing. */
  delete(path: string): Promise<void>;
  ensureDir(path: string): Promise<void>;
  /** Absolute file:// URI. */
  uri(path: string): string;
}

export type LibraryStore = {
  /** Newest first. */
  list(): Promise<DocumentMeta[]>;
  get(id: string): Promise<DocumentMeta | undefined>;
  add(
    bytes: Uint8Array,
    input: { name: string; pageCount: number; source: DocumentSource },
  ): Promise<DocumentMeta>;
  rename(id: string, name: string): Promise<DocumentMeta>;
  /** Unknown id is a no-op. */
  remove(id: string): Promise<void>;
  fileUri(meta: DocumentMeta): string;
};
