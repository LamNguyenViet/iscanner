import { StorageError } from '../../src/errors/AppError';
import { createLibraryStore } from '../../src/library/libraryStore';
import { createMemoryFs } from '../../src/library/memoryFs';
import { defaultName } from '../../src/utils/format';

function setup() {
  const fs = createMemoryFs();
  let t = new Date(2026, 9, 5, 14, 0).getTime();
  const now = () => {
    const d = new Date(t);
    t += 60_000;
    return d;
  };
  let n = 0;
  const newId = () => `id${++n}`;
  const store = createLibraryStore({ fs, now, newId });
  return { fs, store, now, newId };
}

const bytes = new Uint8Array([1, 2, 3, 4, 5]);

describe('libraryStore', () => {
  it('lists empty when no index', async () => {
    const { store } = setup();
    expect(await store.list()).toEqual([]);
  });

  it('adds and lists newest first', async () => {
    const { store, fs } = setup();
    await store.add(bytes, { name: 'A', pageCount: 2, source: 'scan' });
    await store.add(bytes, { name: 'B', pageCount: 1, source: 'merge' });
    const list = await store.list();
    expect(list.map((d) => d.id)).toEqual(['id2', 'id1']);
    const first = list[1];
    expect(first.fileName).toBe('id1.pdf');
    expect(first.sizeBytes).toBe(5);
    expect(first.pageCount).toBe(2);
    expect(first.source).toBe('scan');
    expect(fs.files.has('pdfs/id1.pdf')).toBe(true);
  });

  it('stores unsafe names verbatim and names file by id', async () => {
    const { store, fs } = setup();
    const meta = await store.add(bytes, { name: '  Hợp/đồng: 😀 ', pageCount: 1, source: 'scan' });
    expect(meta.name).toBe('Hợp/đồng: 😀');
    expect(fs.files.has('pdfs/id1.pdf')).toBe(true);
    const blank = await store.add(bytes, { name: '   ', pageCount: 1, source: 'scan' });
    expect(blank.name).toMatch(/^Scan \d{2}-\d{2}-\d{4} \d{2}\.\d{2}$/);
    expect(blank.name).toBe(defaultName('scan', new Date(blank.createdAt)));
  });

  it('renames', async () => {
    const { store } = setup();
    await store.add(bytes, { name: 'A', pageCount: 1, source: 'scan' });
    await store.rename('id1', 'Mới');
    expect((await store.get('id1'))?.name).toBe('Mới');
    await expect(store.rename('nope', 'x')).rejects.toThrow('NOT_FOUND');
  });

  it('removes file and entry', async () => {
    const { store, fs } = setup();
    await store.add(bytes, { name: 'A', pageCount: 1, source: 'scan' });
    await store.remove('id1');
    expect((await store.list()).map((d) => d.id)).not.toContain('id1');
    expect(fs.files.has('pdfs/id1.pdf')).toBe(false);
  });

  it('remove of unknown id is a no-op', async () => {
    const { store, fs } = setup();
    await store.add(bytes, { name: 'A', pageCount: 1, source: 'scan' });
    await expect(store.remove('nope')).resolves.toBeUndefined();
    expect((await store.list()).map((d) => d.id)).toEqual(['id1']);
    expect(fs.files.has('pdfs/id1.pdf')).toBe(true);
  });

  it('recovers from corrupt index', async () => {
    const { store, fs } = setup();
    fs.files.set('library.json', '{oops');
    expect(await store.list()).toEqual([]);
    expect(fs.files.get('library.json.bak')).toBe('{oops');
  });

  it('rolls back pdf when index write fails', async () => {
    const { store, fs } = setup();
    fs.failNextWrite('library.json');
    await expect(store.add(bytes, { name: 'A', pageCount: 1, source: 'scan' })).rejects.toBeInstanceOf(StorageError);
    expect(fs.files.has('pdfs/id1.pdf')).toBe(false);
    expect(await store.list()).toEqual([]);
  });

  it('rename rejects with StorageError when the write fails', async () => {
    const { store, fs } = setup();
    await store.add(bytes, { name: 'A', pageCount: 1, source: 'scan' });
    fs.failNextWrite('library.json');
    await expect(store.rename('id1', 'B')).rejects.toBeInstanceOf(StorageError);
  });

  it('persists across store instances', async () => {
    const { store, fs, now, newId } = setup();
    await store.add(bytes, { name: 'A', pageCount: 1, source: 'scan' });
    const other = createLibraryStore({ fs, now, newId });
    expect((await other.list()).map((d) => d.id)).toEqual(['id1']);
  });
});
