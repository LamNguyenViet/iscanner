import { act, renderHook } from '@testing-library/react-native';

import { useBusy } from '../../src/workflows/useBusy';

describe('useBusy', () => {
  it('runs only once while busy', async () => {
    const { result } = await renderHook(() => useBusy());
    let resolve!: (v: string) => void;
    const fn = jest.fn(() => new Promise<string>((r) => (resolve = r)));

    let first!: Promise<string | undefined>;
    let second!: Promise<string | undefined>;
    await act(async () => {
      first = result.current.run(fn);
      second = result.current.run(fn);
    });
    expect(fn).toHaveBeenCalledTimes(1);
    await expect(second).resolves.toBeUndefined();
    expect(result.current.busy).toBe(true);

    await act(async () => {
      resolve('done');
      await first;
    });
    await expect(first).resolves.toBe('done');
    expect(result.current.busy).toBe(false);

    await act(async () => {
      const p = result.current.run(fn);
      resolve('again');
      await p;
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('resets busy on rejection', async () => {
    const { result } = await renderHook(() => useBusy());
    await act(async () => {
      await expect(result.current.run(() => Promise.reject(new Error('x')))).rejects.toThrow('x');
    });
    expect(result.current.busy).toBe(false);
  });
});
