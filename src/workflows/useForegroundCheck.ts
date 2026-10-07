import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/** Calls `check` every time the app returns to the foreground, and also on mount with `onMount`. */
export function useForegroundCheck(check: () => void, { onMount = false } = {}): void {
  const latest = useRef(check);
  latest.current = check;
  useEffect(() => {
    if (onMount) latest.current();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') latest.current();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
