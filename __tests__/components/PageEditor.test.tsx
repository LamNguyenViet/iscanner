import { Alert, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { PageEditor, type ScanPage } from '../../src/components/PageEditor';
import { applyEdit, detectPageQuad } from '../../src/imaging/enhance';
import { fullQuad, orderQuad, type Quad } from '../../src/imaging/geometry';
import { deleteFiles } from '../../src/native/deleteFiles';
import type { PageLayout } from '../../src/pdf/layout';

jest.mock('react-native-safe-area-context', () => ({
  initialWindowMetrics: null,
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 40, right: 0, bottom: 24, left: 0 }),
}));
jest.mock('../../src/imaging/enhance', () => ({
  detectPageQuad: jest.fn(),
  applyEdit: jest.fn(),
}));
jest.mock('../../src/native/deleteFiles', () => ({
  deleteFiles: jest.fn().mockResolvedValue(undefined),
}));

const mockDetect = detectPageQuad as jest.Mock;
const mockApply = applyEdit as jest.Mock;
const mockDelete = deleteFiles as jest.Mock;

const SIZE = { width: 1000, height: 1500 };
const LAYOUT: PageLayout = { pageSize: 'a4', margin: 'medium' };
const PAGE: ScanPage = { uri: 'p1', align: 'center' };

function detectResult(quad: Quad, detected: boolean) {
  return { quad, size: SIZE, detected };
}

let alertSpy: jest.SpyInstance;
let onCancel: jest.Mock;
let onDone: jest.Mock;
let onRetake: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockDetect.mockResolvedValue(detectResult(fullQuad(1000, 1500), false));
  mockApply.mockResolvedValue('p1-edited');
  onCancel = jest.fn();
  onDone = jest.fn();
  onRetake = jest.fn().mockResolvedValue(null);
});

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderEditor(page: ScanPage = PAGE) {
  await render(
    <PageEditor
      visible
      page={page}
      pageNumber={1}
      layout={LAYOUT}
      onCancel={onCancel}
      onDone={onDone}
      onRetake={onRetake}
    />,
  );
  await flush();
}

async function press(label: string) {
  await fireEvent.press(screen.getByText(label));
  await flush();
}

test('shows the page number and detects corners on open', async () => {
  await renderEditor();
  expect(screen.getByText('Trang 1')).toBeTruthy();
  expect(mockDetect).toHaveBeenCalledWith('p1');
});

test('cancel makes no change', async () => {
  await renderEditor();
  await press('Huỷ');
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onDone).not.toHaveBeenCalled();
  expect(mockApply).not.toHaveBeenCalled();
  expect(mockDelete).not.toHaveBeenCalled();
});

test('done without edits returns same uri with new align', async () => {
  await renderEditor();
  await press('Lấp đầy');
  await press('Xong');
  expect(onDone).toHaveBeenCalledWith({ uri: 'p1', align: 'fill' });
  expect(mockApply).not.toHaveBeenCalled();
});

test('done after rotate applies edit', async () => {
  await renderEditor();
  await press('Xoay ⟳');
  await press('Xong');
  expect(mockApply).toHaveBeenCalledWith('p1', { quad: fullQuad(1000, 1500), rotation: 90 });
  expect(onDone).toHaveBeenCalledWith({ uri: 'p1-edited', align: 'center' });
});

test('rotation wraps around after four turns', async () => {
  await renderEditor();
  for (let i = 0; i < 4; i++) await press('Xoay ⟳');
  await press('Xong');
  expect(mockApply).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalledWith({ uri: 'p1', align: 'center' });
});

test('orders crossed corners before applying', async () => {
  const crossed: Quad = [
    { x: 900, y: 1400 },
    { x: 900, y: 100 },
    { x: 100, y: 100 },
    { x: 100, y: 1400 },
  ];
  mockDetect.mockResolvedValue(detectResult(crossed, true));
  await renderEditor();
  await press('Xong');
  expect(mockApply).toHaveBeenCalledWith('p1', { quad: orderQuad(crossed), rotation: 0 });
  expect(onDone).toHaveBeenCalledWith({ uri: 'p1-edited', align: 'center' });
});

test('blocks done on unusable quad', async () => {
  const tiny: Quad = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  mockDetect.mockResolvedValue(detectResult(tiny, true));
  await renderEditor();
  await press('Xong');
  expect(alertSpy).toHaveBeenCalledWith('Không xử lý được ảnh');
  expect(onDone).not.toHaveBeenCalled();
  expect(mockApply).not.toHaveBeenCalled();
});

test('failure alerts and stays open', async () => {
  mockApply.mockRejectedValueOnce(new Error('boom'));
  await renderEditor();
  await press('Xoay ⟳');
  await press('Xong');
  expect(alertSpy).toHaveBeenCalledWith('Không xử lý được ảnh');
  expect(onDone).not.toHaveBeenCalled();
  expect(screen.getByText('Xong')).toBeTruthy();
});

test('shows a spinner and disables buttons while applying', async () => {
  let resolveApply!: (uri: string) => void;
  mockApply.mockReturnValueOnce(new Promise<string>((r) => (resolveApply = r)));
  await renderEditor();
  await press('Xoay ⟳');
  await press('Xong');
  expect(screen.getByTestId('editor-busy')).toBeTruthy();
  await press('Huỷ');
  await press('Xong');
  expect(onCancel).not.toHaveBeenCalled();
  expect(mockApply).toHaveBeenCalledTimes(1);
  await act(async () => resolveApply('p1-edited'));
  await flush();
  expect(onDone).toHaveBeenCalledWith({ uri: 'p1-edited', align: 'center' });
});

test('retake replaces image', async () => {
  onRetake.mockResolvedValueOnce('p2');
  await renderEditor();
  await press('Xoay ⟳');
  await press('Chụp lại');
  expect(onRetake).toHaveBeenCalledTimes(1);
  expect(mockDetect).toHaveBeenLastCalledWith('p2');
  await press('Xong');
  expect(mockApply).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalledWith({ uri: 'p2', align: 'center' });
  expect(mockDelete).not.toHaveBeenCalled();
});

test('cancelled retake keeps the current image', async () => {
  await renderEditor();
  await press('Chụp lại');
  expect(mockDetect).toHaveBeenCalledTimes(1);
  await press('Xong');
  expect(onDone).toHaveBeenCalledWith({ uri: 'p1', align: 'center' });
});

test('a failed retake alerts and keeps the current image', async () => {
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const error = new Error('scanner crashed');
  onRetake.mockRejectedValueOnce(error);
  await renderEditor();
  await press('Chụp lại');
  expect(alertSpy).toHaveBeenCalledWith('Không xử lý được ảnh');
  expect(warnSpy).toHaveBeenCalledWith('retake failed', error);
  expect(mockDetect).toHaveBeenCalledTimes(1);
  await press('Xong');
  expect(onDone).toHaveBeenCalledWith({ uri: 'p1', align: 'center' });
  warnSpy.mockRestore();
});

test('a cancelled retake does not alert', async () => {
  await renderEditor();
  await press('Chụp lại');
  expect(alertSpy).not.toHaveBeenCalled();
});

test('cancel after retake keeps original and deletes retaken file', async () => {
  onRetake.mockResolvedValueOnce('p2');
  await renderEditor();
  await press('Chụp lại');
  await press('Huỷ');
  expect(mockDelete).toHaveBeenCalledWith(['p2']);
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onDone).not.toHaveBeenCalled();
});

test('a second retake deletes the first retaken file', async () => {
  onRetake.mockResolvedValueOnce('p2').mockResolvedValueOnce('p3');
  await renderEditor();
  await press('Chụp lại');
  await press('Chụp lại');
  expect(mockDelete).toHaveBeenCalledWith(['p2']);
  await press('Xong');
  expect(onDone).toHaveBeenCalledWith({ uri: 'p3', align: 'center' });
});

test('editing a retaken image deletes the intermediate retaken file', async () => {
  onRetake.mockResolvedValueOnce('p2');
  mockApply.mockResolvedValueOnce('p2-edited');
  await renderEditor();
  await press('Chụp lại');
  await press('Xoay ⟳');
  await press('Xong');
  expect(mockApply).toHaveBeenCalledWith('p2', { quad: fullQuad(1000, 1500), rotation: 90 });
  expect(onDone).toHaveBeenCalledWith({ uri: 'p2-edited', align: 'center' });
  expect(mockDelete).toHaveBeenCalledWith(['p2']);
});

test('Tự cắt sát re-runs detection', async () => {
  const detectedQuad: Quad = [
    { x: 100, y: 100 },
    { x: 900, y: 100 },
    { x: 900, y: 1400 },
    { x: 100, y: 1400 },
  ];
  await renderEditor();
  mockDetect.mockResolvedValueOnce(detectResult(detectedQuad, true));
  await press('Tự cắt sát');
  expect(mockDetect).toHaveBeenCalledTimes(2);
  expect(mockDetect).toHaveBeenLastCalledWith('p1');
  await press('Xong');
  expect(mockApply).toHaveBeenCalledWith('p1', { quad: detectedQuad, rotation: 0 });
});

test('Toàn ảnh resets corners', async () => {
  const detectedQuad: Quad = [
    { x: 100, y: 100 },
    { x: 900, y: 100 },
    { x: 900, y: 1400 },
    { x: 100, y: 1400 },
  ];
  mockDetect.mockResolvedValue(detectResult(detectedQuad, true));
  await renderEditor();
  await press('Toàn ảnh');
  expect(mockDetect).toHaveBeenCalledTimes(1);
  await press('Xoay ⟳');
  await press('Xong');
  expect(mockApply).toHaveBeenCalledWith('p1', { quad: fullQuad(1000, 1500), rotation: 90 });
});

test('renders four corner handles and the page preview', async () => {
  await renderEditor();
  for (let i = 0; i < 4; i++) expect(screen.getByTestId(`corner-${i}`)).toBeTruthy();
  expect(screen.getByTestId('page-preview-image')).toBeTruthy();
});

test('preview uses the rotated image size after rotate', async () => {
  await renderEditor();
  const portrait = screen.getByTestId('page-preview-image').props.style;
  const portraitStyle = Object.assign({}, ...[portrait].flat());
  expect(portraitStyle.height).toBeGreaterThan(portraitStyle.width);
  await press('Xoay ⟳');
  const landscape = Object.assign({}, ...[screen.getByTestId('page-preview-image').props.style].flat());
  expect(landscape.width).toBeGreaterThan(landscape.height);
});

describe('PageEditor system bar insets', () => {
  it('pads the header by the top inset and the align row by the bottom inset', async () => {
    await renderEditor();
    await flush();
    const header = StyleSheet.flatten(screen.getByTestId('editor-header').props.style);
    const row = StyleSheet.flatten(screen.getByTestId('editor-align-row').props.style);
    expect(header.paddingTop).toBeGreaterThanOrEqual(40);
    expect(row.paddingBottom).toBeGreaterThanOrEqual(24);
  });
});
