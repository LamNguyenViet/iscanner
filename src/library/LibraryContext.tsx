import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { log } from '../logging/logger';
import { expoFs } from './expoFs';
import { createLibraryStore } from './libraryStore';
import type { DocumentMeta, LibraryStore } from './types';

type LibraryValue = {
  documents: DocumentMeta[];
  loading: boolean;
  store: LibraryStore;
  refresh(): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
};

const LibraryContext = createContext<LibraryValue | null>(null);

export function LibraryProvider({
  store: injected,
  children,
}: {
  store?: LibraryStore;
  children: ReactNode;
}) {
  const [store] = useState(() => injected ?? createLibraryStore({ fs: expoFs }));
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setDocuments(await store.list());
    } catch (e) {
      log.warn('library refresh failed', { cause: e });
      throw e;
    }
  }, [store]);

  useEffect(() => {
    let active = true;
    store
      .list()
      .then((docs) => {
        if (active) setDocuments(docs);
      })
      .catch((e) => {
        // keep the empty list; screens can retry with refresh()
        log.warn('library list failed on load', { cause: e });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [store]);

  const rename = useCallback(
    async (id: string, name: string) => {
      await store.rename(id, name);
      await refresh();
    },
    [store, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await store.remove(id);
      await refresh();
    },
    [store, refresh],
  );

  const value = useMemo(
    () => ({ documents, loading, store, refresh, rename, remove }),
    [documents, loading, store, refresh, rename, remove],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryValue {
  const value = useContext(LibraryContext);
  if (!value) throw new Error('useLibrary must be used within a LibraryProvider');
  return value;
}
