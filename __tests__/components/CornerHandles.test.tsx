import {
  containRect,
  editorImageRect,
  HANDLE,
  imageToScreen,
  rotatedSize,
  screenToImage,
} from '../../src/components/CornerHandles';

const SIZE = { width: 1000, height: 1500 };

test('containRect fits and centres', () => {
  const r = containRect({ width: 1000, height: 1500 }, { width: 400, height: 400 });
  expect(r.x).toBeCloseTo((400 - (400 * 1000) / 1500) / 2);
  expect(r.y).toBe(0);
  expect(r.width).toBeCloseTo((400 * 1000) / 1500);
  expect(r.height).toBeCloseTo(400);
});

test('containRect of an unmeasured box is empty', () => {
  expect(containRect({ width: 1000, height: 1500 }, { width: 0, height: 0 })).toEqual({ x: 0, y: 0, width: 0, height: 0 });
});

test('rotatedSize swaps for 90/270', () => {
  expect(rotatedSize(SIZE, 0)).toEqual(SIZE);
  expect(rotatedSize(SIZE, 90)).toEqual({ width: 1500, height: 1000 });
  expect(rotatedSize(SIZE, 180)).toEqual(SIZE);
  expect(rotatedSize(SIZE, 270)).toEqual({ width: 1500, height: 1000 });
});

test('imageToScreen maps corners clockwise with rotation', () => {
  // rect for the displayed (rotated) image at scale 0.1
  const rect0 = { x: 10, y: 20, width: 100, height: 150 };
  expect(imageToScreen({ x: 0, y: 0 }, SIZE, 0, rect0)).toEqual({ x: 10, y: 20 });
  expect(imageToScreen({ x: 1000, y: 1500 }, SIZE, 0, rect0)).toEqual({ x: 110, y: 170 });

  const rect90 = { x: 0, y: 0, width: 150, height: 100 };
  // clockwise 90: image top-left ends up at the top-right of the screen rect
  expect(imageToScreen({ x: 0, y: 0 }, SIZE, 90, rect90)).toEqual({ x: 150, y: 0 });
  // image bottom-left ends up at the top-left
  expect(imageToScreen({ x: 0, y: 1500 }, SIZE, 90, rect90)).toEqual({ x: 0, y: 0 });

  const rect180 = { x: 0, y: 0, width: 100, height: 150 };
  expect(imageToScreen({ x: 0, y: 0 }, SIZE, 180, rect180)).toEqual({ x: 100, y: 150 });

  const rect270 = { x: 0, y: 0, width: 150, height: 100 };
  // counter-clockwise: image top-left ends up at the bottom-left
  expect(imageToScreen({ x: 0, y: 0 }, SIZE, 270, rect270)).toEqual({ x: 0, y: 100 });
});

test('screenToImage inverts imageToScreen for every rotation', () => {
  const p = { x: 250, y: 1200 };
  for (const rotation of [0, 90, 180, 270] as const) {
    const r = rotatedSize(SIZE, rotation);
    const rect = { x: 5, y: 7, width: r.width / 4, height: r.height / 4 };
    const back = screenToImage(imageToScreen(p, SIZE, rotation, rect), SIZE, rotation, rect);
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  }
});

test('screenToImage on an empty rect returns origin instead of NaN', () => {
  expect(screenToImage({ x: 3, y: 4 }, SIZE, 0, { x: 0, y: 0, width: 0, height: 0 })).toEqual({
    x: 0,
    y: 0,
  });
});

describe('handles', () => {
  test('are 44 dp touch targets', () => {
    expect(HANDLE).toBe(44);
  });

  test('editorImageRect keeps every image corner at least HANDLE/2 inside the canvas', () => {
    const canvas = { width: 360, height: 500 };
    for (const content of [SIZE, { width: 1500, height: 1000 }, { width: 1000, height: 1000 }]) {
      const r = editorImageRect(content, canvas);
      expect(r.x).toBeGreaterThanOrEqual(HANDLE / 2 - 1e-9);
      expect(r.y).toBeGreaterThanOrEqual(HANDLE / 2 - 1e-9);
      expect(r.x + r.width).toBeLessThanOrEqual(canvas.width - HANDLE / 2 + 1e-9);
      expect(r.y + r.height).toBeLessThanOrEqual(canvas.height - HANDLE / 2 + 1e-9);
      // Still the largest fit with the content's aspect ratio inside the inset box.
      expect(r.width / r.height).toBeCloseTo(content.width / content.height);
      expect(
        Math.abs(r.width - (canvas.width - HANDLE)) < 1e-6 ||
          Math.abs(r.height - (canvas.height - HANDLE)) < 1e-6,
      ).toBe(true);
    }
  });

  test('editorImageRect of an unmeasured or too small canvas is empty', () => {
    expect(editorImageRect(SIZE, { width: 0, height: 0 })).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(editorImageRect(SIZE, { width: 40, height: 40 })).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});
