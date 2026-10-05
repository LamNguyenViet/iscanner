import { Alert, Linking } from 'react-native';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import Scan from '../../app/scan';
import { LibraryProvider } from '../../src/library/LibraryContext';
import { createLibraryStore } from '../../src/library/libraryStore';
import { createMemoryFs } from '../../src/library/memoryFs';
import { deleteFiles } from '../../src/native/deleteFiles';
import { scanDocuments } from '../../src/scanner/scanner';
import { createScanDocument } from '../../src/workflows/scanWorkflow';

const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    back: (...args: unknown[]) => mockBack(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));
jest.mock('../../src/scanner/scanner', () => ({ scanDocuments: jest.fn() }));
jest.mock('../../src/workflows/scanWorkflow', () => ({ createScanDocument: jest.fn() }));
jest.mock('../../src/native/readBytes', () => ({ readBytes: jest.fn() }));
jest.mock('../../src/native/deleteFiles', () => ({
  deleteFiles: jest.fn().mockResolvedValue(undefined),
}));
const mockDraggableProps = jest.fn();
jest.mock('react-native-draggable-flatlist', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FlatList } = require('react-native');
  return {
    __esModule: true,
    default: ({ renderItem, containerStyle, ...rest }: any) => (
      mockDraggableProps({ containerStyle }),
      <FlatList
        {...rest}
        renderItem={({ item }: any) => renderItem({ item, drag: jest.fn(), isActive: false })}
      />
    ),
  };
});

const mockScan = scanDocuments as jest.Mock;
const mockCreate = createScanDocument as jest.Mock;
const mockDeleteFiles = deleteFiles as jest.Mock;

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
  expect(mockCreate).toHaveBeenCalledWith(expect.anything(), ['a', 'b'], expect.any(String));
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
    expect(mockDeleteFiles).toHaveBeenCalledWith(['a']);
    expect(screen.queryByText('Trang 2')).toBeNull();
  });

  test('deletes all page images after a successful create', async () => {
    mockScan.mockResolvedValueOnce(['a', 'b']);
    mockCreate.mockResolvedValueOnce({ id: 'id1' });
    await renderScan();
    await fireEvent.press(screen.getByText('Tạo PDF'));
    expect(mockDeleteFiles).toHaveBeenCalledWith(['a', 'b']);
    await screen.unmount();
    expect(mockDeleteFiles).toHaveBeenCalledTimes(1);
  });

  test('deletes remaining page images when leaving without creating', async () => {
    mockScan.mockResolvedValueOnce(['a', 'b']);
    await renderScan();
    expect(mockDeleteFiles).not.toHaveBeenCalled();
    await screen.unmount();
    expect(mockDeleteFiles).toHaveBeenCalledWith(['a', 'b']);
  });

  test('keeps page images when create fails', async () => {
    mockScan.mockResolvedValueOnce(['a']);
    mockCreate.mockRejectedValueOnce(new Error('boom'));
    await renderScan();
    await fireEvent.press(screen.getByText('Tạo PDF'));
    expect(mockDeleteFiles).not.toHaveBeenCalled();
  });
});
