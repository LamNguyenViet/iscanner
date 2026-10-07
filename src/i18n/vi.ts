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
  library: {
    empty: 'Chưa có tài liệu nào. Hãy scan hoặc gộp PDF để bắt đầu.',
    scan: 'Scan tài liệu',
    merge: 'Gộp PDF',
    deleteConfirm: 'Xoá tài liệu này?',
    save: 'Lưu',
  },
  viewer: {
    notFound: 'Không tìm thấy tài liệu',
    back: 'Quay lại',
    share: 'Chia sẻ',
    openError: 'Không mở được tài liệu',
  },
  documentMenu: {
    rename: 'Đổi tên',
    share: 'Chia sẻ',
    delete: 'Xoá',
    cancel: 'Huỷ',
    closeMenu: 'Đóng menu',
  },
  nameInput: {
    label: 'Tên tài liệu',
  },
  errors: {
    generic: 'Có lỗi xảy ra',
  },
  titles: {
    library: 'iScanner',
    scan: 'Scan tài liệu',
    merge: 'Gộp PDF',
    viewer: 'Tài liệu',
    incoming: 'Nhận file',
  },
  format: {
    scanPrefix: 'Scan',
    mergePrefix: 'Gộp',
    pages: (n: number) => `${n} trang`,
    dateOrder: 'dmy' as 'dmy' | 'mdy',
  },
};

export type Strings = typeof vi;
