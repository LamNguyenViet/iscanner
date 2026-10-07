import { Alert, Linking } from 'react-native';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import Scan from '../../app/scan';
import { LibraryProvider } from '../../src/library/LibraryContext';
import { createLibraryStore } from '../../src/library/libraryStore';
import { createMemoryFs } from '../../src/library/memoryFs';
import { clearPending, setPending } from '../../src/share/incomingStore';
import { deleteFiles } from '../../src/native/deleteFiles';
import { scanDocuments } from '../../src/scanner/scanner';
import { DEFAULT_LAYOUT } from '../../src/pdf/layout';
import { createScanDocument } from '../../src/workflows/scanWorkflow';
import { normalizePage } from '../../src/imaging/enhance';

const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 0 }));
jest.mock('expo-router', () => ({
  router: {
    back: (...args: unknown[]) => mockBack(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));
jest.mock('../../src/scanner/scanner', () => ({ scanDocuments: jest.fn() }));
jest.mock('../../src/workflows/scanWorkflow', () => ({ createScanDocument: jest.fn() }));
jest.mock('../../src/imaging/enhance', () => ({ normalizePage: jest.fn() }));
const mockEditorProps = jest.fn();
jest.mock('../../src/components/PageEditor', () => ({
  PageEditor: (props: any) => (mockEditorProps(props), null),
}));
jest.mock('../../src/native/readBytes', () => ({ readBytes: jest.fn() }));
jest.mock('../../src/native/deleteFiles', () => ({
  deleteFiles: jest.fn().mockResolvedValue(undefined),
}));
const mockDraggableProps = jest.fn();
// The `drag` callback DraggableFlatList hands to every row.
const mockDrag = jest.fn();
jest.mock('react-native-draggable-flatlist', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FlatList } = require('react-native');
  return {
    __esModule: true,
    default: ({ renderItem, containerStyle, ...rest }: any) => (
      mockDraggableProps({ containerStyle }),
      <FlatList
        {...rest}
        // Every test page fits the initial render window; keep the list's deferred
        // re-render timer (default 50 ms) from firing outside act mid-test.
        updateCellsBatchingPeriod={60_000}
        renderItem={({ item }: any) => renderItem({ item, drag: mockDrag, isActive: false })}
      />
    ),
  };
});

const mockScan = scanDocuments as jest.Mock;
const mockCreate = createScanDocument as jest.Mock;
const mockDeleteFiles = deleteFiles as jest.Mock;
const mockNormalize = normalizePage as jest.Mock;

// Lets pending promises settle and the list's deferred render timer fire inside act.
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderScan() {
  const store = createLibraryStore({ fs: createMemoryFs(), newId: () => 'id1' });
  await render(
    <LibraryProvider store={store}>
      <Scan />
    </LibraryProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return store;
}

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockNormalize.mockImplementation((uri: string) => Promise.resolve(uri + '-n'));
});

test('goes back when first scan is cancelled', async () => {
  mockScan.mockResolvedValueOnce([]);
  await renderScan();
  expect(mockScan).toHaveBeenCalledTimes(1);
  expect(mockBack).toHaveBeenCalled();
});

test('keeps pages when re-scan is cancelled', async () => {
  mockScan.mockResolvedValueOnce(['a', 'b']).mockResolvedValueOnce([]);
  await renderScan();
  expect(screen.getByText('Trang 1')).toBeTruthy();
  expect(screen.getByText('Trang 2')).toBeTruthy();
  await fireEvent.press(screen.getByText('+ Chụp thêm'));
  expect(mockScan).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Trang 1')).toBeTruthy();
  expect(screen.getByText('Trang 2')).toBeTruthy();
  expect(mockBack).not.toHaveBeenCalled();
});

test('creates pdf and opens viewer', async () => {
  mockScan.mockResolvedValueOnce(['a', 'b']);
  mockCreate.mockResolvedValueOnce({ id: 'id1' });
  await renderScan();
  await fireEvent.press(screen.getByText('Tạo PDF'));
  expect(mockCreate).toHaveBeenCalledWith(
    expect.anything(),
    [
      { uri: 'a-n', align: 'center' },
      { uri: 'b-n', align: 'center' },
    ],
    expect.any(String),
    DEFAULT_LAYOUT,
  );
  expect(mockReplace).toHaveBeenCalledWith('/viewer/id1');
});

test('alerts on failure', async () => {
  mockScan.mockResolvedValueOnce(['a']);
  mockCreate.mockRejectedValueOnce(new Error('boom'));
  await renderScan();
  await fireEvent.press(screen.getByText('Tạo PDF'));
  expect(alertSpy).toHaveBeenCalledWith('Không thể tạo PDF');
  expect(mockReplace).not.toHaveBeenCalled();
});

test('camera permission alert on first scan goes back on cancel', async () => {
  mockScan.mockRejectedValueOnce(new Error('CAMERA_PERMISSION'));
  await renderScan();
  expect(alertSpy).toHaveBeenCalledWith('Cần quyền camera', undefined, expect.any(Array));
  const buttons = alertSpy.mock.calls[0][2];
  await act(async () => {
    buttons.find((b: any) => b.text === 'Huỷ').onPress();
  });
  expect(mockBack).toHaveBeenCalled();
});

test('page list is flex-constrained so the action row stays on screen', async () => {
  mockScan.mockResolvedValueOnce(['a']);
  await renderScan();
  const { containerStyle } = mockDraggableProps.mock.calls.at(-1)![0];
  expect(containerStyle).toEqual(expect.objectContaining({ flex: 1 }));
});

test('a failed refresh after a successful create still opens the viewer', async () => {
  mockScan.mockResolvedValueOnce(['a']);
  mockCreate.mockResolvedValueOnce({ id: 'id1' });
  const store = await renderScan();
  jest.spyOn(store, 'list').mockRejectedValue(new Error('io'));
  await fireEvent.press(screen.getByText('Tạo PDF'));
  expect(mockReplace).toHaveBeenCalledWith('/viewer/id1');
  expect(alertSpy).not.toHaveBeenCalled();
});

test('generic scan error offers settings and goes back', async () => {
  const settingsSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  mockScan.mockRejectedValueOnce(new Error('Kamera nicht verfügbar'));
  await renderScan();
  expect(alertSpy).toHaveBeenCalledWith(
    'Không thể scan tài liệu',
    'Nếu bạn đã từ chối quyền camera, hãy cấp quyền trong Cài đặt.',
    expect.any(Array),
  );
  const buttons = alertSpy.mock.calls[0][2];
  expect(buttons.map((b: any) => b.text)).toEqual(['Mở Cài đặt', 'Đóng']);
  await act(async () => {
    buttons.find((b: any) => b.text === 'Mở Cài đặt').onPress();
  });
  expect(settingsSpy).toHaveBeenCalled();
  expect(mockBack).toHaveBeenCalledTimes(1);
  await act(async () => {
    buttons.find((b: any) => b.text === 'Đóng').onPress();
  });
  expect(mockBack).toHaveBeenCalledTimes(2);
  settingsSpy.mockRestore();
});

describe('temporary image cleanup', () => {
  test('deletes a page image when the page is removed', async () => {
    mockScan.mockResolvedValueOnce(['a', 'b']);
    await renderScan();
    await fireEvent.press(screen.getAllByText('Xoá')[0]);
    expect(mockDeleteFiles).toHaveBeenCalledWith(['a-n']);
    expect(screen.queryByText('Trang 2')).toBeNull();
  });

  test('deletes all page images after a successful create', async () => {
    mockScan.mockResolvedValueOnce(['a', 'b']);
    mockCreate.mockResolvedValueOnce({ id: 'id1' });
    await renderScan();
    mockDeleteFiles.mockClear();
    await fireEvent.press(screen.getByText('Tạo PDF'));
    expect(mockDeleteFiles).toHaveBeenCalledWith(['a-n', 'b-n']);
    await screen.unmount();
    expect(mockDeleteFiles).toHaveBeenCalledTimes(1);
  });

  test('deletes remaining page images when leaving without creating', async () => {
    mockScan.mockResolvedValueOnce(['a', 'b']);
    await renderScan();
    mockDeleteFiles.mockClear();
    await screen.unmount();
    expect(mockDeleteFiles).toHaveBeenCalledWith(['a-n', 'b-n']);
  });

  test('keeps page images when create fails', async () => {
    mockScan.mockResolvedValueOnce(['a']);
    mockCreate.mockRejectedValueOnce(new Error('boom'));
    await renderScan();
    mockDeleteFiles.mockClear();
    await fireEvent.press(screen.getByText('Tạo PDF'));
    expect(mockDeleteFiles).not.toHaveBeenCalled();
  });
});

describe('layout', () => {
  test('name input does not grab focus (keyboard would cover the buttons)', async () => {
    mockScan.mockResolvedValueOnce(['a']);
    await renderScan();
    expect(screen.getByLabelText('Tên tài liệu').props.autoFocus).toBeFalsy();
  });

  test('action row clears the bottom safe area', async () => {
    mockScan.mockResolvedValueOnce(['a']);
    await renderScan();
    expect(screen.getByTestId('actions')).toHaveStyle({ paddingBottom: 16 + 34 });
  });

  test('thumbnails are downsampled', async () => {
    mockScan.mockResolvedValueOnce(['a']);
    await renderScan();
    expect(screen.getByTestId('thumb').props.resizeMethod).toBe('resize');
  });
});

describe('normalization', () => {
  test('normalizes scanned pages with overlay', async () => {
    const pending: Array<() => void> = [];
    mockNormalize.mockImplementation(
      (uri: string) => new Promise<string>((resolve) => pending.push(() => resolve(uri + '-n'))),
    );
    mockScan.mockResolvedValueOnce(['a', 'b']);
    await renderScan();
    expect(screen.getByText('Đang xử lý ảnh…')).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Chụp thêm' })).toBeDisabled();
    await act(async () => {
      pending.shift()!();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      pending.shift()!();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockNormalize.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
    expect(screen.queryByText('Đang xử lý ảnh…')).toBeNull();
    expect(screen.getByText('Trang 1')).toBeTruthy();
    expect(screen.getByText('Trang 2')).toBeTruthy();
    expect(mockDeleteFiles).toHaveBeenCalledWith(['a', 'b']);
  });

  test('deletes processed images when the screen is left during processing', async () => {
    let finish: () => void = () => {};
    mockNormalize.mockImplementation(
      (uri: string) => new Promise<string>((resolve) => (finish = () => resolve(uri + '-n'))),
    );
    mockScan.mockResolvedValueOnce(['a']);
    await renderScan();
    await screen.unmount();
    await act(async () => finish());
    expect(mockDeleteFiles).toHaveBeenCalledWith(['a']);
    expect(mockDeleteFiles).toHaveBeenCalledWith(['a-n']);
  });

  test('keeps raw page when normalize fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockNormalize.mockImplementation((uri: string) =>
      uri === 'b' ? Promise.reject(new Error('bad')) : Promise.resolve(uri + '-n'),
    );
    mockScan.mockResolvedValueOnce(['a', 'b']);
    mockCreate.mockResolvedValueOnce({ id: 'id1' });
    await renderScan();
    expect(screen.getByText('Trang 1')).toBeTruthy();
    expect(screen.getByText('Trang 2')).toBeTruthy();
    expect(mockDeleteFiles).toHaveBeenCalledWith(['a']);
    expect(mockDeleteFiles.mock.calls.some((c) => c[0].includes('b'))).toBe(false);
    await fireEvent.press(screen.getByText('Tạo PDF'));
    expect(mockCreate.mock.calls[0][1].map((p: any) => p.uri)).toEqual(['a-n', 'b']);
    warnSpy.mockRestore();
  });
});

describe('layout controls', () => {
  test('layout controls change PDF layout', async () => {
    mockScan.mockResolvedValueOnce(['a']);
    mockCreate.mockResolvedValueOnce({ id: 'id1' });
    await renderScan();
    expect(screen.getByText('Khổ giấy')).toBeTruthy();
    expect(screen.getByText('Lề')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'A4' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Vừa' })).toBeSelected();
    await fireEvent.press(screen.getByText('Letter'));
    await fireEvent.press(screen.getByText('Nhỏ'));
    expect(screen.getByRole('button', { name: 'Letter' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Nhỏ' })).toBeSelected();
    await fireEvent.press(screen.getByText('Tạo PDF'));
    expect(mockCreate.mock.calls[0][3]).toEqual({ pageSize: 'letter', margin: 'small' });
  });

  test('Theo ảnh disables margin options', async () => {
    mockScan.mockResolvedValueOnce(['a']);
    await renderScan();
    expect(screen.getByRole('button', { name: 'Không' })).toBeEnabled();
    await fireEvent.press(screen.getByText('Theo ảnh'));
    for (const name of ['Không', 'Nhỏ', 'Vừa']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });
});

describe('page editor', () => {
  const lastEditorProps = () => mockEditorProps.mock.calls.at(-1)![0];
  // Props of the Pressable that owns a host element. On device the innermost Pressable becomes
  // the touch responder, so a long-press only drags if THAT Pressable handles it (fireEvent
  // would bubble to the row and hide the bug).
  const ownPressableProps = (element: { unstable_fiber?: any }) => {
    let fiber = element.unstable_fiber;
    while (fiber && typeof fiber.memoizedProps?.onPress !== 'function') fiber = fiber.return;
    return fiber.memoizedProps;
  };

  test('rows show the alignment label and edit button', async () => {
    mockScan.mockResolvedValueOnce(['a', 'b']);
    await renderScan();
    expect(screen.getAllByText('Giữa')).toHaveLength(2);
    expect(screen.getAllByText('Sửa')).toHaveLength(2);
    expect(mockEditorProps).not.toHaveBeenCalled();
  });

  test('Sửa opens editor for that page', async () => {
    mockScan.mockResolvedValueOnce(['a', 'b']);
    await renderScan();
    await fireEvent.press(screen.getAllByText('Sửa')[1]);
    const props = lastEditorProps();
    expect(props.visible).toBe(true);
    expect(props.page).toEqual({ uri: 'b-n', align: 'center' });
    expect(props.pageNumber).toBe(2);
    expect(props.layout).toEqual(DEFAULT_LAYOUT);
  });

  test('tapping the thumbnail opens the editor', async () => {
    mockScan.mockResolvedValueOnce(['a', 'b']);
    await renderScan();
    await fireEvent.press(screen.getAllByLabelText('Sửa trang')[0]);
    expect(lastEditorProps().page.uri).toBe('a-n');
    expect(lastEditorProps().pageNumber).toBe(1);
  });

  test('long-pressing the thumbnail starts a drag and does not open the editor', async () => {
    mockScan.mockResolvedValueOnce(['a', 'b']);
    await renderScan();
    mockDrag.mockClear();
    await fireEvent(screen.getAllByLabelText('Sửa trang')[0], 'longPress');
    expect(mockDrag).toHaveBeenCalledTimes(1);
    expect(ownPressableProps(screen.getAllByLabelText('Sửa trang')[0]).onLongPress).toBe(mockDrag);
    expect(mockEditorProps.mock.calls.every((c) => !c[0].visible)).toBe(true);
  });

  test('long-pressing Sửa or Xoá starts a drag instead of editing or deleting', async () => {
    mockScan.mockResolvedValueOnce(['a', 'b']);
    await renderScan();
    mockDrag.mockClear();
    await fireEvent(screen.getAllByText('Sửa')[0], 'longPress');
    await fireEvent(screen.getAllByText('Xoá')[0], 'longPress');
    expect(mockDrag).toHaveBeenCalledTimes(2);
    expect(ownPressableProps(screen.getAllByText('Sửa')[0]).onLongPress).toBe(mockDrag);
    expect(ownPressableProps(screen.getAllByText('Xoá')[0]).onLongPress).toBe(mockDrag);
    expect(mockEditorProps.mock.calls.every((c) => !c[0].visible)).toBe(true);
    expect(screen.getAllByText('Xoá')).toHaveLength(2);
  });

  test('a failed retake scan rejects so the editor can report it', async () => {
    mockScan.mockResolvedValueOnce(['a']);
    await renderScan();
    await fireEvent.press(screen.getByText('Sửa'));
    mockScan.mockRejectedValueOnce(new Error('scanner crashed'));
    await act(async () => {
      await expect(lastEditorProps().onRetake()).rejects.toThrow('scanner crashed');
    });
  });

  test('cancel closes the editor without changes', async () => {
    mockScan.mockResolvedValueOnce(['a']);
    await renderScan();
    await fireEvent.press(screen.getByText('Sửa'));
    const { onCancel } = lastEditorProps();
    mockEditorProps.mockClear();
    mockDeleteFiles.mockClear();
    await act(async () => onCancel());
    expect(mockEditorProps.mock.calls.every((c) => !c[0].visible)).toBe(true);
    expect(mockDeleteFiles).not.toHaveBeenCalled();
    expect(screen.getByText('Giữa')).toBeTruthy();
  });

  test('editor done updates page in place', async () => {
    mockScan.mockResolvedValueOnce(['a', 'b']);
    mockCreate.mockResolvedValueOnce({ id: 'id1' });
    await renderScan();
    await fireEvent.press(screen.getAllByText('Sửa')[1]);
    mockDeleteFiles.mockClear();
    const { onDone } = lastEditorProps();
    await act(async () => onDone({ uri: 'b-edit', align: 'top' }));
    expect(mockDeleteFiles).toHaveBeenCalledWith(['b-n']);
    expect(screen.getByText('Trên')).toBeTruthy();
    expect(screen.getAllByText('Giữa')).toHaveLength(1);
    expect(screen.getByText('Trang 2')).toBeTruthy();
    await fireEvent.press(screen.getByText('Tạo PDF'));
    expect(mockCreate.mock.calls[0][1]).toEqual([
      { uri: 'a-n', align: 'center' },
      { uri: 'b-edit', align: 'top' },
    ]);
  });

  test('editor done with the same uri does not delete it', async () => {
    mockScan.mockResolvedValueOnce(['a']);
    await renderScan();
    await fireEvent.press(screen.getByText('Sửa'));
    mockDeleteFiles.mockClear();
    const { onDone } = lastEditorProps();
    await act(async () => onDone({ uri: 'a-n', align: 'fill' }));
    expect(mockDeleteFiles).not.toHaveBeenCalled();
    expect(screen.getByText('Lấp đầy')).toBeTruthy();
  });

  test('retake returns normalized single page', async () => {
    mockScan.mockResolvedValueOnce(['a']);
    await renderScan();
    await fireEvent.press(screen.getByText('Sửa'));
    mockDeleteFiles.mockClear();
    mockScan.mockResolvedValueOnce(['r1', 'r2']);
    let result: string | null = null;
    await act(async () => {
      result = await lastEditorProps().onRetake();
    });
    expect(mockScan).toHaveBeenLastCalledWith({ maxPages: 1 });
    expect(result).toBe('r1-n');
    expect(mockDeleteFiles).toHaveBeenCalledWith(['r2']);
    expect(mockDeleteFiles).toHaveBeenCalledWith(['r1']);
  });

  test('cancelled retake returns null', async () => {
    mockScan.mockResolvedValueOnce(['a']);
    await renderScan();
    await fireEvent.press(screen.getByText('Sửa'));
    mockScan.mockResolvedValueOnce([]);
    let result: string | null = 'x';
    await act(async () => {
      result = await lastEditorProps().onRetake();
    });
    expect(result).toBeNull();
  });

  test('retake keeps the raw image when normalize fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockScan.mockResolvedValueOnce(['a']);
    await renderScan();
    await fireEvent.press(screen.getByText('Sửa'));
    mockDeleteFiles.mockClear();
    mockNormalize.mockRejectedValueOnce(new Error('bad'));
    mockScan.mockResolvedValueOnce(['r1']);
    let result: string | null = null;
    await act(async () => {
      result = await lastEditorProps().onRetake();
    });
    expect(result).toBe('r1');
    expect(mockDeleteFiles).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('received files', () => {
  const img = (name: string) => ({ uri: 'file:///' + name, name, kind: 'image' as const, size: 1 });

  test('uses pending images instead of camera', async () => {
    setPending({ pdfs: [], images: [img('a.jpg'), img('b.jpg')] });
    await renderScan();
    expect(mockScan).not.toHaveBeenCalled();
    expect(mockNormalize).toHaveBeenCalledWith('file:///a.jpg');
    expect(mockNormalize).toHaveBeenCalledWith('file:///b.jpg');
    expect(screen.getByText('Trang 1')).toBeTruthy();
    expect(screen.getByText('Trang 2')).toBeTruthy();
    expect(mockDeleteFiles).toHaveBeenCalledWith(['file:///a.jpg', 'file:///b.jpg']);
  });

  test('keeps the incoming copy as the page when normalizing fails', async () => {
    setPending({ pdfs: [], images: [img('a.jpg')] });
    mockNormalize.mockRejectedValueOnce(new Error('bad'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await renderScan();
    warn.mockRestore();
    expect(screen.getByText('Trang 1')).toBeTruthy();
    expect(mockDeleteFiles).not.toHaveBeenCalled();
  });
});
