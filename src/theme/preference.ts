import { expoFs } from '../library/expoFs';
import type { FsAdapter } from '../library/types';

export type ThemePreference = 'system' | 'light' | 'dark';

/** Holds an object so later settings can be added without a migration. */
export const SETTINGS_PATH = 'settings.json';

/** Value for Appearance.setColorScheme; 'unspecified' follows the device. */
export function toNativeScheme(p: ThemePreference): 'light' | 'dark' | 'unspecified' {
  return p === 'system' ? 'unspecified' : p;
}

/** Missing, unreadable or unknown values mean 'system'. */
export function parsePreference(json: string | null): ThemePreference {
  if (json === null) return 'system';
  try {
    const theme: unknown = JSON.parse(json)?.theme;
    return theme === 'light' || theme === 'dark' ? theme : 'system';
  } catch {
    return 'system';
  }
}

/** Never throws. */
export async function loadPreference(fs: FsAdapter = expoFs): Promise<ThemePreference> {
  try {
    return parsePreference(await fs.readText(SETTINGS_PATH));
  } catch {
    return 'system';
  }
}

export async function savePreference(p: ThemePreference, fs: FsAdapter = expoFs): Promise<void> {
  await fs.writeText(SETTINGS_PATH, JSON.stringify({ theme: p }));
}
