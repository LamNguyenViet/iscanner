import { useCallback, useRef, useState } from 'react';

export type Keyed<T> = { key: string; value: T };

export function useOrderedList<T>() {
  const [items, setItems] = useState<Keyed<T>[]>([]);
  const counter = useRef(0);

  const append = useCallback((values: T[]) => {
    const added = values.map((value) => ({ key: `item-${counter.current++}`, value }));
    setItems((prev) => [...prev, ...added]);
  }, []);

  const remove = useCallback((key: string) => {
    setItems((prev) => prev.filter((item) => item.key !== key));
  }, []);

  const setOrder = useCallback((next: Keyed<T>[]) => setItems(next), []);

  const update = useCallback((key: string, value: T) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, value } : item)));
  }, []);

  return { items, append, remove, setOrder, update };
}
