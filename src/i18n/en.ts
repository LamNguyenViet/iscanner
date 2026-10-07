import type { Strings } from './vi';

export const en: Strings = {
  common: {
    cancel: 'Cancel',
    untitled: 'Document',
  },
  settings: {
    title: 'Settings',
    appearance: 'Appearance',
    language: 'Language',
    system: 'System default',
    light: 'Light',
    dark: 'Dark',
    vietnamese: 'Tiếng Việt',
    english: 'English',
  },
  format: {
    scanPrefix: 'Scan',
    mergePrefix: 'Merge',
    pages: (n: number) => (n === 1 ? '1 page' : `${n} pages`),
    dateOrder: 'mdy',
  },
};
