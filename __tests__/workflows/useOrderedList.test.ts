import { act, renderHook } from '@testing-library/react-native';

import { useOrderedList } from '../../src/workflows/useOrderedList';

const values = (items: { value: string }[]) => items.map((i) => i.value);

describe('useOrderedList', () => {
  it('appends and removes', async () => {
    const { result } = await renderHook(() => useOrderedList<string>());
    await act(async () => result.current.append(['a', 'b']));
    await act(async () => result.current.append(['c']));
    expect(values(result.current.items)).toEqual(['a', 'b', 'c']);

    const keyOfB = result.current.items[1].key;
    await act(async () => result.current.remove(keyOfB));
    expect(values(result.current.items)).toEqual(['a', 'c']);
  });

  it('allows duplicate values with distinct keys', async () => {
    const { result } = await renderHook(() => useOrderedList<string>());
    await act(async () => result.current.append(['x', 'x']));
    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0].key).not.toBe(result.current.items[1].key);
  });

  it('setOrder reorders', async () => {
    const { result } = await renderHook(() => useOrderedList<string>());
    await act(async () => result.current.append(['a', 'b']));
    const items = result.current.items;
    await act(async () => result.current.setOrder([items[1], items[0]]));
    expect(values(result.current.items)).toEqual(['b', 'a']);
  });

  it('update replaces value in place', async () => {
    const { result } = await renderHook(() => useOrderedList<string>());
    await act(async () => result.current.append(['a', 'b', 'c']));
    const keyOfB = result.current.items[1].key;
    const keysBeforeUpdate = result.current.items.map((i) => i.key);
    await act(async () => result.current.update(keyOfB, 'B'));
    expect(values(result.current.items)).toEqual(['a', 'B', 'c']);
    expect(result.current.items.map((i) => i.key)).toEqual(keysBeforeUpdate);
  });

  it('update unknown key is a no-op', async () => {
    const { result } = await renderHook(() => useOrderedList<string>());
    await act(async () => result.current.append(['a', 'b', 'c']));
    const itemsBefore = result.current.items;
    await act(async () => result.current.update('nonexistent-key', 'x'));
    expect(result.current.items).toEqual(itemsBefore);
  });
});
