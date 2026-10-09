import { ActionSheetIOS, Alert, BackHandler, Platform } from 'react-native';
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
let mockScreenOptions: any = {};
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  Stack: {
    Screen: ({ options }: { options?: unknown }) => {
      mockScreenOptions = options ?? {};
      return null;
    },
  },
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

const mockLog = jest.requireMock('../../src/logging/logger').log;

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  mockPush.mockClear();
  mockLog.info.mockClear();
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
    await fireEvent.press(screen.getByLabelText(/Thêm thao tác|More actions/));
    for (const label of ['Đổi tên', 'Chia sẻ', 'Xoá', 'Huỷ']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    await fireEvent.press(screen.getByText('Huỷ'));
    expect(screen.queryByText('Đổi tên')).toBeNull();
  });

  test('Xoá asks for confirmation', async () => {
    await renderHome(true);
    await fireEvent.press(screen.getByLabelText(/Thêm thao tác|More actions/));
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
  await fireEvent.press(screen.getByLabelText(/Thêm thao tác|More actions/));
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
  await fireEvent.press(screen.getByLabelText(/Thêm thao tác|More actions/));
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
  await fireEvent.press(screen.getByLabelText(/Thêm thao tác|More actions/));
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
    await fireEvent.press(screen.getByLabelText(/Thêm thao tác|More actions/));
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
    await fireEvent.press(screen.getByLabelText(/Thêm thao tác|More actions/));
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
    await fireEvent.press(screen.getByLabelText(/Thêm thao tác|More actions/));
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
    await fireEvent.press(screen.getByLabelText(/Thêm thao tác|More actions/));
    await fireEvent.press(screen.getByText('Đổi tên'));
    await fireEvent.press(screen.getByText('Lưu'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Không lưu được tài liệu',
      'Không lưu được tài liệu. Hãy kiểm tra dung lượng trống của máy.\n\nMã lỗi: STORAGE',
      undefined,
    );
  });

  test('a delete rejected with StorageError shows the STORAGE popup and keeps the document', async () => {
    const store = await renderHome(true);
    jest.spyOn(store, 'remove').mockRejectedValueOnce(new StorageError());
    await fireEvent.press(screen.getByLabelText(/Thêm thao tác|More actions/));
    await fireEvent.press(screen.getByText('Xoá'));
    const buttons = alertSpy.mock.calls[0][2];
    await act(async () => {
      buttons.find((b: any) => b.style === 'destructive').onPress();
    });
    expect(alertSpy).toHaveBeenLastCalledWith(
      'Không lưu được tài liệu',
      'Không lưu được tài liệu. Hãy kiểm tra dung lượng trống của máy.\n\nMã lỗi: STORAGE',
      undefined,
    );
    expect(screen.getByText('Hoa don')).toBeTruthy();
  });

  test('a delete failure with a plain Error shows the UNKNOWN popup', async () => {
    const store = await renderHome(true);
    jest.spyOn(store, 'remove').mockRejectedValueOnce(new Error('boom'));
    await fireEvent.press(screen.getByLabelText(/Thêm thao tác|More actions/));
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

describe('events', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
  });

  test('rename, delete and share are logged', async () => {
    (shareDocument as jest.Mock).mockResolvedValueOnce(undefined);
    await renderHome(true);
    await fireEvent.press(screen.getByLabelText(/Thêm thao tác|More actions/));
    await fireEvent.press(screen.getByText('Chia sẻ'));
    expect(mockLog.info).toHaveBeenCalledWith('document.shared');
    await fireEvent.press(screen.getByLabelText(/Thêm thao tác|More actions/));
    await fireEvent.press(screen.getByText('Đổi tên'));
    await fireEvent.press(screen.getByText('Lưu'));
    expect(mockLog.info).toHaveBeenCalledWith('document.renamed');
    await fireEvent.press(screen.getByLabelText(/Thêm thao tác|More actions/));
    await fireEvent.press(screen.getByText('Xoá'));
    const buttons = alertSpy.mock.calls[0][2];
    await act(async () => {
      buttons.find((b: any) => b.style === 'destructive').onPress();
    });
    expect(mockLog.info).toHaveBeenCalledWith('document.deleted', { count: 1 });
  });
});

async function renderHomeMany(names: string[], english = false) {
  let n = 0;
  const store = createLibraryStore({ fs: createMemoryFs(), newId: () => `id${++n}` });
  for (const name of names) {
    await store.add(new Uint8Array(10), { name, pageCount: 1, source: 'scan' });
  }
  const home = (
    <LibraryProvider store={store}>
      <Home />
    </LibraryProvider>
  );
  await render(english ? <LocaleProvider fs={createMemoryFs()}>{home}</LocaleProvider> : home);
  await settleTheme();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return store;
}

/**
 * Presses a header button from the captured Stack.Screen options. The element is not rendered
 * (a second render would replace the screen under test); its label and onPress are used directly.
 */
async function pressHeader(key: 'headerLeft' | 'headerRight', label: RegExp) {
  const element = mockScreenOptions[key]!({});
  expect(element.props.accessibilityLabel).toMatch(label);
  await act(async () => {
    element.props.onPress();
  });
}

const checkbox = (name: string) => screen.getByLabelText(name).props.accessibilityState;

describe('multi-select delete', () => {
  beforeEach(() => {
    mockScreenOptions = {};
  });

  test('long-press enters selection mode with that document selected', async () => {
    await renderHomeMany(['A', 'B']);
    await fireEvent(screen.getByText('A'), 'longPress');
    expect(mockScreenOptions.title).toBe('Đã chọn 1');
    expect(checkbox('A')).toMatchObject({ checked: true });
    expect(checkbox('B')).toMatchObject({ checked: false });
    expect(screen.getByText('Xoá (1)')).toBeTruthy();
    expect(screen.queryByText('Scan tài liệu')).toBeNull();
  });

  test('tapping rows toggles them instead of opening the viewer', async () => {
    await renderHomeMany(['A', 'B']);
    await fireEvent(screen.getByText('A'), 'longPress');
    await fireEvent.press(screen.getByText('B'));
    expect(mockScreenOptions.title).toBe('Đã chọn 2');
    await fireEvent.press(screen.getByText('A'));
    expect(checkbox('A')).toMatchObject({ checked: false });
    expect(mockScreenOptions.title).toBe('Đã chọn 1');
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('deselecting everything keeps selection mode, with Delete disabled', async () => {
    await renderHomeMany(['A']);
    await fireEvent(screen.getByText('A'), 'longPress');
    await fireEvent.press(screen.getByText('A'));
    expect(mockScreenOptions.title).toBe('Đã chọn 0');
    expect(screen.getByRole('button', { name: 'Xoá (0)' })).toBeDisabled();
  });

  test('select all, then deselect all', async () => {
    await renderHomeMany(['A', 'B', 'C']);
    await fireEvent(screen.getByText('A'), 'longPress');
    await pressHeader('headerRight', /^Chọn tất cả$/);
    expect(mockScreenOptions.title).toBe('Đã chọn 3');
    await pressHeader('headerRight', /^Bỏ chọn tất cả$/);
    expect(mockScreenOptions.title).toBe('Đã chọn 0');
  });

  test('the exit button leaves selection mode', async () => {
    await renderHomeMany(['A']);
    await fireEvent(screen.getByText('A'), 'longPress');
    await pressHeader('headerLeft', /Thoát chế độ chọn/);
    expect(screen.getByText('Scan tài liệu')).toBeTruthy();
    // Options set by a screen persist after it unmounts, so the screen must restore the normal header.
    expect(mockScreenOptions.title).toBe('iScanner');
    expect(mockScreenOptions.headerLeft).toBeUndefined();
    await render(<>{mockScreenOptions.headerRight!({})}</>);
    expect(screen.getByLabelText('Cài đặt')).toBeTruthy();
  });

  test('Android back leaves selection mode instead of the app', async () => {
    let handler: (() => boolean) | undefined;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
      handler = h as () => boolean;
      return { remove: jest.fn() } as any;
    });
    await renderHomeMany(['A']);
    await fireEvent(screen.getByText('A'), 'longPress');
    let consumed = false;
    await act(async () => {
      consumed = handler!();
    });
    expect(consumed).toBe(true);
    expect(screen.getByText('Scan tài liệu')).toBeTruthy();
  });

  test('deleting two documents asks with the count, deletes them and leaves selection mode', async () => {
    const store = await renderHomeMany(['A', 'B', 'C']);
    await fireEvent(screen.getByText('A'), 'longPress');
    await fireEvent.press(screen.getByText('B'));
    await fireEvent.press(screen.getByText('Xoá (2)'));
    expect(alertSpy).toHaveBeenCalledWith('Xoá 2 tài liệu?', undefined, expect.any(Array));
    const buttons = alertSpy.mock.calls[0][2];
    expect(buttons.map((b: any) => b.text)).toEqual(['Xoá', 'Huỷ']);
    await act(async () => {
      buttons.find((b: any) => b.style === 'destructive').onPress();
    });
    expect((await store.list()).map((d) => d.name)).toEqual(['C']);
    expect(screen.queryByText('A')).toBeNull();
    expect(screen.getByText('Scan tài liệu')).toBeTruthy();
    expect(mockLog.info).toHaveBeenCalledWith('document.deleted', { count: 2 });
  });

  test('deleting one selected document uses the single confirmation', async () => {
    await renderHomeMany(['A', 'B']);
    await fireEvent(screen.getByText('A'), 'longPress');
    await fireEvent.press(screen.getByText('Xoá (1)'));
    expect(alertSpy).toHaveBeenCalledWith('Xoá tài liệu này?', undefined, expect.any(Array));
  });

  test('cancelling keeps every document and stays in selection mode', async () => {
    const store = await renderHomeMany(['A', 'B']);
    await fireEvent(screen.getByText('A'), 'longPress');
    await fireEvent.press(screen.getByText('B'));
    await fireEvent.press(screen.getByText('Xoá (2)'));
    expect(alertSpy.mock.calls[0][2].find((b: any) => b.style === 'cancel').onPress).toBeUndefined();
    expect(await store.list()).toHaveLength(2);
    expect(mockScreenOptions.title).toBe('Đã chọn 2');
  });

  test('a failed delete shows the STORAGE popup and keeps the documents', async () => {
    const store = await renderHomeMany(['A', 'B']);
    jest.spyOn(store, 'removeMany').mockRejectedValueOnce(new StorageError());
    await fireEvent(screen.getByText('A'), 'longPress');
    await fireEvent.press(screen.getByText('B'));
    await fireEvent.press(screen.getByText('Xoá (2)'));
    await act(async () => {
      alertSpy.mock.calls[0][2].find((b: any) => b.style === 'destructive').onPress();
    });
    expect(alertSpy).toHaveBeenLastCalledWith(
      'Không lưu được tài liệu',
      expect.stringContaining('Mã lỗi: STORAGE'),
      undefined,
    );
    expect(await store.list()).toHaveLength(2);
  });

  test('English labels', async () => {
    mockLocales = [{ languageCode: 'en', languageTag: 'en-US' }];
    await renderHomeMany(['A', 'B'], true);
    expect(screen.getAllByLabelText('More actions')).toHaveLength(2);
    await fireEvent(screen.getByText('A'), 'longPress');
    expect(mockScreenOptions.title).toBe('1 selected');
    expect(screen.getByText('Delete (1)')).toBeTruthy();
    await pressHeader('headerRight', /^Select all$/);
    await fireEvent.press(screen.getByText('Delete (2)'));
    expect(alertSpy).toHaveBeenCalledWith('Delete 2 documents?', undefined, expect.any(Array));
  });
});
