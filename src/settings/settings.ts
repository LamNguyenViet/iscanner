import { log } from '../logging/logger';
import { expoFs } from '../library/expoFs';
import type { FsAdapter } from '../library/types';

export type ThemePreference = 'system' | 'light' | 'dark';
export type LanguagePreference = 'system' | 'vi' | 'en';
export type UpdateState = {
  lastCheckedAt?: number;
  forceMinBuild?: number;
  snooze?: { build: number; until: number };
  lastBuild?: number;
};
export type Settings = { theme: ThemePreference; language: LanguagePreference; update?: UpdateState };

/** Holds an object so later settings can be added without a migration. */
export const SETTINGS_PATH = 'settings.json';

/** Value for Appearance.setColorScheme; 'unspecified' follows the device. */
export function toNativeScheme(p: ThemePreference): 'light' | 'dark' | 'unspecified' {
  return p === 'system' ? 'unspecified' : p;
}

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const isBuild = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1;

/** Any invalid field makes the whole block undefined. */
function parseUpdateState(raw: unknown): UpdateState | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: UpdateState = {};
  if (r.lastCheckedAt !== undefined) {
    if (!isNum(r.lastCheckedAt)) return undefined;
    out.lastCheckedAt = r.lastCheckedAt;
  }
  if (r.forceMinBuild !== undefined) {
    if (!isBuild(r.forceMinBuild)) return undefined;
    out.forceMinBuild = r.forceMinBuild;
  }
  if (r.lastBuild !== undefined) {
    if (!isBuild(r.lastBuild)) return undefined;
    out.lastBuild = r.lastBuild;
  }
  if (r.snooze !== undefined) {
    const s = r.snooze as Record<string, unknown> | null;
    if (typeof s !== 'object' || s === null || !isBuild(s.build) || !isNum(s.until)) return undefined;
    out.snooze = { build: s.build, until: s.until };
  }
  return out;
}

/** Missing, unreadable or unknown values mean 'system'. */
export function parseSettings(json: string | null): Settings {
  const settings: Settings = { theme: 'system', language: 'system' };
  if (json === null) return settings;
  try {
    const parsed = JSON.parse(json);
    if (parsed?.theme === 'light' || parsed?.theme === 'dark') settings.theme = parsed.theme;
    if (parsed?.language === 'vi' || parsed?.language === 'en') settings.language = parsed.language;
    const update = parseUpdateState(parsed?.update);
    if (update) settings.update = update;
  } catch {
    // keep defaults
  }
  return settings;
}

/** Never throws. */
export async function loadSettings(fs: FsAdapter = expoFs): Promise<Settings> {
  try {
    return parseSettings(await fs.readText(SETTINGS_PATH));
  } catch (e) {
    log.warn('loadSettings failed; using defaults', { cause: e });
    return parseSettings(null);
  }
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Read-merge-write, serialized so concurrent saves never overwrite each other.
 * Rejects on a write failure; later saves still run.
 */
export function saveSettings(patch: Partial<Settings>, fs: FsAdapter = expoFs): Promise<void> {
  const run = async () => {
    const current = await loadSettings(fs);
    await fs.writeText(SETTINGS_PATH, JSON.stringify({ ...current, ...patch }));
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}
