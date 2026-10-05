import { Alert } from 'react-native';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import Scan from '../../app/scan';
import { LibraryProvider } from '../../src/library/LibraryContext';
import { createLibraryStore } from '../../src/library/libraryStore';
import { createMemoryFs } from '../../src/library/memoryFs';
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
