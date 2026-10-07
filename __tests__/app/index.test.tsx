import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { ShareError, StorageError } from '../../src/errors/AppError';
import { shareDocument } from '../../src/native/share';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import Home from '../../app/index';
import { LocaleProvider } from '../../src/i18n/LocaleContext';
import { LibraryProvider } from '../../src/library/LibraryContext';
import { createLibraryStore } from '../../src/library/libraryStore';
import { createMemoryFs } from '../../src/library/memoryFs';
import { settleTheme, styleOf, themed } from '../fixtures/theme';

const mockPush = jest.fn();
jest.mock('../../src/native/share', () => ({ shareDocument: jest.fn() }));
let mockLocales = [{ languageCode: 'en', languageTag: 'en-US' }];
jest.mock('expo-localization', () => ({ useLocales: () => mockLocales }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useFocusEffect: (cb: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(() => cb(), []);
  },
}));

let mockColorScheme = 'light';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme,
}));

async function renderHome(withDoc: boolean, dark = false, english = false) {
  const store = createLibraryStore({ fs: createMemoryFs(), newId: () => 'id1' });
  if (withDoc) {
    await store.add(new Uint8Array(1536), { name: 'Hoa don', pageCount: 3, source: 'scan' });
  }
  const home = (
    <LibraryProvider store={store}>
      <Home />
    </LibraryProvider>
  );
  const ui = english ? <LocaleProvider fs={createMemoryFs()}>{home}</LocaleProvider> : home;
  mockColorScheme = dark ? 'dark' : 'light';
  await render(dark ? themed(ui) : ui);
  await settleTheme();
  // let the provider load and the focus refresh settle inside act
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return store;
}

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  mockPush.mockClear();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

test('shows empty state', async () => {
  await renderHome(false);
  expect(
    await screen.findByText('Chưa có tài liệu nào. Hãy scan hoặc gộp PDF để bắt đầu.'),
  ).toBeTruthy();
});

test('lists documents with meta', async () => {
  await renderHome(true);
  expect(await screen.findByText('Hoa don')).toBeTruthy();
  expect(screen.getByText(/3 trang/)).toBeTruthy();
  expect(screen.getByText(/1\.5 KB/)).toBeTruthy();
});

test('navigates', async () => {
  await renderHome(true);
  await fireEvent.press(screen.getByText('Scan tài liệu'));
  expect(mockPush).toHaveBeenCalledWith('/scan');
  await fireEvent.press(screen.getByText('Gộp PDF'));
  expect(mockPush).toHaveBeenCalledWith('/merge');
  await fireEvent.press(screen.getByText('Hoa don'));
  expect(mockPush).toHaveBeenCalledWith('/viewer/id1');
});

describe('long-press menu on Android', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
  });

  test('opens a dismissable menu with all actions', async () => {
    await renderHome(true);
    await fireEvent(screen.getByText('Hoa don'), 'longPress');
    for (const label of ['Đổi tên', 'Chia sẻ', 'Xoá', 'Huỷ']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    await fireEvent.press(screen.getByText('Huỷ'));
    expect(screen.queryByText('Đổi tên')).toBeNull();
  });

  test('Xoá asks for confirmation', async () => {
    await renderHome(true);
    await fireEvent(screen.getByText('Hoa don'), 'longPress');
    await fireEvent.press(screen.getByText('Xoá'));
    expect(alertSpy).toHaveBeenCalledWith('Xoá tài liệu này?', undefined, expect.any(Array));
    expect(screen.queryByText('Đổi tên')).toBeNull();
  });
});

test('long-press on iOS uses the native action sheet', async () => {
  const sheetSpy = jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(() => {});
  await renderHome(true);
  await fireEvent(screen.getByText('Hoa don'), 'longPress');
  expect(sheetSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      options: ['Đổi tên', 'Chia sẻ', 'Xoá', 'Huỷ'],
      destructiveButtonIndex: 2,
      cancelButtonIndex: 3,
    }),
    expect.any(Function),
  );
  const callback = sheetSpy.mock.calls[0][1];
  await act(async () => callback(2));
  expect(alertSpy).toHaveBeenCalledWith('Xoá tài liệu này?', undefined, expect.any(Array));
});

test('action row clears the bottom safe area', async () => {
  await renderHome(false);
  expect(screen.getByTestId('actions')).toHaveStyle({ paddingBottom: 16 + 34 });
});

test('rename dialog focuses the name input', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await renderHome(true);
  await fireEvent(screen.getByText('Hoa don'), 'longPress');
  await fireEvent.press(screen.getByText('Đổi tên'));
  expect(screen.getByLabelText('Tên tài liệu').props.autoFocus).toBe(true);
});

test('dark theme: screen and empty state', async () => {
  await renderHome(false, true);
  expect(styleOf(screen.root!).backgroundColor).toBe('#121212');
  expect(styleOf(screen.getByText(/Chưa có tài liệu nào/)).color).toBe('#a0a0a0');
});

test('dark theme: rename dialog', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await renderHome(true, true);
  await fireEvent(screen.getByText('Hoa don'), 'longPress');
  await fireEvent.press(screen.getByText('Đổi tên'));
  const input = screen.getByLabelText('Tên tài liệu');
  expect(styleOf(input).color).toBe('#e8e8e8');
  let dialog = input.parent;
  while (dialog && styleOf(dialog).borderRadius !== 12) dialog = dialog.parent;
  expect(styleOf(dialog!).backgroundColor).toBe('#1e1e1e');
  expect(styleOf(screen.getByText('Lưu')).color).toBe('#4c8dff');
});

describe('English', () => {
  test('empty state and buttons', async () => {
    await renderHome(false, false, true);
    expect(
      await screen.findByText('No documents yet. Scan or merge PDFs to get started.'),
    ).toBeTruthy();
    expect(screen.getByText('Scan document')).toBeTruthy();
    expect(screen.getByText('Merge PDF')).toBeTruthy();
  });

  test('Android menu and delete confirmation', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await renderHome(true, false, true);
    await fireEvent(screen.getByText('Hoa don'), 'longPress');
    for (const label of ['Rename', 'Share', 'Delete', 'Cancel']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    await fireEvent.press(screen.getByText('Delete'));
    expect(alertSpy).toHaveBeenCalledWith('Delete this document?', undefined, expect.any(Array));
  });

  test('iOS action sheet options', async () => {
    const sheetSpy = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation(() => {});
    await renderHome(true, false, true);
    await fireEvent(screen.getByText('Hoa don'), 'longPress');
    expect(sheetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ options: ['Rename', 'Share', 'Delete', 'Cancel'] }),
      expect.any(Function),
    );
    const callback = sheetSpy.mock.calls[0][1];
    await act(async () => callback(2));
    expect(alertSpy).toHaveBeenCalledWith('Delete this document?', undefined, expect.any(Array));
  });
});

describe('errors', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
  });

  test('a share failure shows the SHARE popup', async () => {
    (shareDocument as jest.Mock).mockRejectedValueOnce(new ShareError());
    await renderHome(true);
    await fireEvent(screen.getByText('Hoa don'), 'longPress');
    await fireEvent.press(screen.getByText('Chia sẻ'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Không chia sẻ được',
      'Không mở được bảng chia sẻ, vui lòng thử lại.\n\nMã lỗi: SHARE',
      undefined,
    );
  });

  test('a rename failure shows the STORAGE popup', async () => {
    const store = await renderHome(true);
    jest.spyOn(store, 'rename').mockRejectedValueOnce(new StorageError());
    await fireEvent(screen.getByText('Hoa don'), 'longPress');
    await fireEvent.press(screen.getByText('Đổi tên'));
    await fireEvent.press(screen.getByText('Lưu'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Không lưu được tài liệu',
      'Không lưu được tài liệu. Hãy kiểm tra dung lượng trống của máy.\n\nMã lỗi: STORAGE',
      undefined,
    );
  });

  test('a delete failure with a plain Error shows the UNKNOWN popup', async () => {
    const store = await renderHome(true);
    jest.spyOn(store, 'remove').mockRejectedValueOnce(new Error('boom'));
    await fireEvent(screen.getByText('Hoa don'), 'longPress');
    await fireEvent.press(screen.getByText('Xoá'));
    const buttons = alertSpy.mock.calls[0][2];
    await act(async () => {
      buttons.find((b: any) => b.style === 'destructive').onPress();
    });
    expect(alertSpy).toHaveBeenLastCalledWith(
      'Có lỗi xảy ra',
      'Đã có lỗi không mong muốn, vui lòng thử lại.\n\nMã lỗi: UNKNOWN',
      undefined,
    );
  });
});
