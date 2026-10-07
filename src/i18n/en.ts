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
  library: {
    empty: 'No documents yet. Scan or merge PDFs to get started.',
    scan: 'Scan document',
    merge: 'Merge PDF',
    deleteConfirm: 'Delete this document?',
    save: 'Save',
  },
  viewer: {
    notFound: 'Document not found',
    back: 'Go back',
    share: 'Share',
    openError: 'Could not open the document',
  },
  documentMenu: {
    rename: 'Rename',
    share: 'Share',
    delete: 'Delete',
    cancel: 'Cancel',
    closeMenu: 'Close menu',
  },
  nameInput: {
    label: 'Document name',
  },
  errors: {
    generic: 'Something went wrong',
  },
  titles: {
    library: 'iScanner',
    scan: 'Scan document',
    merge: 'Merge PDF',
    viewer: 'Document',
    incoming: 'Receive files',
  },
  format: {
    scanPrefix: 'Scan',
    mergePrefix: 'Merge',
    pages: (n: number) => (n === 1 ? '1 page' : `${n} pages`),
    dateOrder: 'mdy',
  },
};
