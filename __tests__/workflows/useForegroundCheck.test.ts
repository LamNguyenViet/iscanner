import { AppState, type AppStateStatus } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';

import { useForegroundCheck } from '../../src/workflows/useForegroundCheck';

let handler: ((s: AppStateStatus) => void) | undefined;
const remove = jest.fn();

beforeEach(() => {
  handler = undefined;
  remove.mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, h) => {
    handler = h as (s: AppStateStatus) => void;
    return { remove } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => jest.restoreAllMocks());

describe('useForegroundCheck', () => {
  it('runs on mount when asked, and every time the app comes back to the foreground', async () => {
    const check = jest.fn();
    await renderHook(() => useForegroundCheck(check, { onMount: true }));
    expect(check).toHaveBeenCalledTimes(1);

    await act(async () => handler!('background'));
    expect(check).toHaveBeenCalledTimes(1);
    await act(async () => handler!('active'));
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('does not run on mount by default', async () => {
    const check = jest.fn();
    await renderHook(() => useForegroundCheck(check));
    expect(check).not.toHaveBeenCalled();
    await act(async () => handler!('active'));
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('calls the latest callback and stops listening on unmount', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender, unmount } = await renderHook(({ cb }: { cb: () => void }) => useForegroundCheck(cb), {
      initialProps: { cb: first },
    });
    const subscriptions = (AppState.addEventListener as jest.Mock).mock.calls.length;
    await rerender({ cb: second });
    await act(async () => handler!('active'));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(AppState.addEventListener).toHaveBeenCalledTimes(subscriptions);

    await unmount();
    expect(remove).toHaveBeenCalled();
  });
});
