import { createContext, useContext, type ReactNode } from 'react';
import { useUpdateCheck, type UpdateCheck, type UpdateDeps } from './useUpdateCheck';

// Outside a provider (e.g. screen tests) there is nothing to update.
const UpdateContext = createContext<UpdateCheck>({
  decision: { kind: 'none' },
  busy: false,
  startUpdate: async () => {},
  cancel: () => {},
  snooze: async () => {},
  checkNow: async () => 'none',
});

/** Runs the single update check instance shared by the gate and the settings screen. */
export function UpdateProvider({ children, deps }: { children: ReactNode; deps?: UpdateDeps }) {
  const value = useUpdateCheck(deps);
  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

export function useUpdate(): UpdateCheck {
  return useContext(UpdateContext);
}
