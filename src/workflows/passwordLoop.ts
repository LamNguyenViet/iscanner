import { log } from '../logging/logger';

export type AskPassword = (fileName: string, wrongBefore: boolean) => Promise<string | null>;

/**
 * Shared password ask loop. Tries the known password, then '' once silently, then asks the user.
 * Resolves null when the user skips. Passwords are never logged.
 */
export async function withPasswordLoop<T>(
  open: (password: string | undefined) => Promise<T>,
  opts: {
    fileName: string;
    ask?: AskPassword;
    known?: string;
    needsPassword: (e: unknown) => boolean;
    wrongPassword: (e: unknown) => boolean;
    event: 'pdf' | 'word';
  },
): Promise<{ value: T; password?: string } | null> {
  const { fileName, ask, known, needsPassword, wrongPassword, event } = opts;
  let password = known;
  let firstError: unknown;
  let triedEmpty = known === '';
  // True once a real (non-silent) password has failed: only then is the prompt a retry.
  let userTried = known !== undefined && known !== '';
  for (;;) {
    try {
      const value = await open(password);
      if (password !== undefined) log.info(`${event}.unlocked`, { file: fileName });
      return password === undefined ? { value } : { value, password };
    } catch (e) {
      if (!wrongPassword(e) && !needsPassword(e)) throw e;
      firstError ??= e;
      // Owner-restricted files open with an empty user password: try it silently before asking.
      if (!triedEmpty) {
        triedEmpty = true;
        password = '';
        continue;
      }
      if (!ask) throw firstError;
      // A failed silent attempt is not a wrong answer from the user.
      const answer = await ask(fileName, userTried);
      if (typeof answer !== 'string') {
        log.info(`${event}.unlockSkipped`, { file: fileName });
        return null;
      }
      password = answer;
      userTried = true;
    }
  }
}
