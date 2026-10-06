import { redirectIncomingPath } from '../src/share/redirect';

/** Routes shared / "open with" files (Android SEND/VIEW, iOS open-in) to the incoming screen. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return redirectIncomingPath(path);
}
