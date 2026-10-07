import type { LanguagePreference } from '../settings/settings';
import { en } from './en';
import { vi, type Strings } from './vi';

export type Language = 'vi' | 'en';

/** 'system' follows the device: Vietnamese devices get vi, everything else en. */
export function resolveLanguage(
  pref: LanguagePreference,
  deviceCode: string | null | undefined,
): Language {
  if (pref !== 'system') return pref;
  return deviceCode?.toLowerCase().split(/[-_]/)[0] === 'vi' ? 'vi' : 'en';
}

export function stringsFor(lang: Language): Strings {
  return lang === 'vi' ? vi : en;
}
