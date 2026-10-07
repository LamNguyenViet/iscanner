export const vi = {
  common: {
    cancel: 'Hủy',
    untitled: 'Tài liệu',
  },
  settings: {
    title: 'Cài đặt',
    appearance: 'Giao diện',
    language: 'Ngôn ngữ',
    system: 'Theo hệ thống',
    light: 'Sáng',
    dark: 'Tối',
    vietnamese: 'Tiếng Việt',
    english: 'English',
  },
  format: {
    scanPrefix: 'Scan',
    mergePrefix: 'Gộp',
    pages: (n: number) => `${n} trang`,
    dateOrder: 'dmy' as 'dmy' | 'mdy',
  },
};

export type Strings = typeof vi;
