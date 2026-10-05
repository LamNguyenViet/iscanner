import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import Home from '../../app/index';
import { LibraryProvider } from '../../src/library/LibraryContext';
import { createLibraryStore } from '../../src/library/libraryStore';
import { createMemoryFs } from '../../src/library/memoryFs';

const mockPush = jest.fn();
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

async function renderHome(withDoc: boolean) {
  const store = createLibraryStore({ fs: createMemoryFs(), newId: () => 'id1' });
  if (withDoc) {
    await store.add(new Uint8Array(1536), { name: 'Hoa don', pageCount: 3, source: 'scan' });
  }
  await render(
    <LibraryProvider store={store}>
      <Home />
    </LibraryProvider>,
  );
  // let the provider load and the focus refresh settle inside act
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
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
