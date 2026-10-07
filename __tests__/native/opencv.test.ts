import { log } from '../../src/logging/logger';
import { detectQuad, renderPage } from '../../src/native/opencv';
import type { Quad } from '../../src/imaging/geometry';

// Mirrors react-native-fast-opencv 1.0.1's native behaviour where it matters:
// cpp/structures/point2fVector/Point2fVectorFactory.cpp `create` IGNORES its arguments and
// always returns an empty vector; points must be added with `push`. getPerspectiveTransform
// asserts both inputs hold exactly 4 points (cv::getPerspectiveTransform checkVector == 4).
type Obj = { released: boolean; release(): void };
const created: Obj[] = [];
const perspectiveCalls: { from: unknown[]; to: unknown[] }[] = [];
// Contours the mocked findContours reports, per binary image it is given: Canny edges dilated
// with a 3×3 ("edges3") or 5×5 ("edges5") kernel, or the Otsu-thresholded image ("otsu").
// approxPolyDP returns each contour unchanged.
type MockPoint = { x: number; y: number };
type MockMat = { tag?: string; ksize?: number };
const mockContours: Record<string, MockPoint[][]> = { edges3: [], edges5: [], otsu: [] };
const mockRetrievalModes: unknown[] = [];
// Size (cols × rows) of the image Mat.createFromBase64 decodes, and the log of the render
// pipeline's pixel ops: each entry names the op, its input/output Mat ids and output size.
const mockSource = { cols: 4000, rows: 3000 };
const mockFailSave = { value: false };
type SizedMat = { cols: number; rows: number; id: number };
type MockOp = {
  op: string;
  src?: number;
  dst?: number;
  cols?: number;
  rows?: number;
  args?: unknown[];
};
const mockOps: MockOp[] = [];

jest.mock('react-native-fast-opencv', () => {
  const track = <T extends object>(o: T): T & Obj => {
    const obj = Object.assign(o, {
      released: false,
      release() {
        obj.released = true;
      },
    });
    created.push(obj);
    return obj;
  };
  let nextId = 0;
  const mat = (cols = 0, rows = 0) => {
    const m = track({
      id: ++nextId,
      cols,
      rows,
      tag: undefined as string | undefined,
      saveToFile(path: string, format: string, quality: number) {
        if (mockFailSave.value) throw new Error('Failed to save Mat to file: ' + path);
        mockOps.push({ op: 'save', src: m.id, cols: m.cols, rows: m.rows, args: [path, format, quality] });
      },
    });
    return m;
  };
  const output = (op: string, src: SizedMat, dst: SizedMat, cols: number, rows: number, args?: unknown[]) => {
    dst.cols = cols;
    dst.rows = rows;
    mockOps.push({ op, src: src.id, dst: dst.id, cols, rows, args });
  };
  const pointVector = (points: MockPoint[] = []) =>
    track({
      points,
      get length() {
        return points.length;
      },
      getAll: () => points.map((p) => track({ x: p.x, y: p.y })),
    });
  return {
    BorderTypes: { BORDER_CONSTANT: 0, BORDER_REPLICATE: 1 },
    ColorConversionCodes: {},
    ContourApproximationModes: {},
    DataTypes: { CV_8U: 0 },
    DecompTypes: { DECOMP_LU: 0 },
    InterpolationFlags: { INTER_LINEAR: 1, INTER_AREA: 3 },
    MorphShapes: { MORPH_RECT: 0 },
    MorphTypes: { MORPH_CLOSE: 3 },
    RetrievalModes: { RETR_LIST: 1 },
    ThresholdTypes: { THRESH_BINARY: 0, THRESH_OTSU: 8 },
    RotateFlags: { ROTATE_90_CLOCKWISE: 0, ROTATE_180: 1, ROTATE_90_COUNTERCLOCKWISE: 2 },
    OpenCV: {
      Mat: { create: () => mat(), createFromBase64: () => mat(mockSource.cols, mockSource.rows) },
      Size: { create: (width: number, height: number) => track({ width, height }) },
      Scalar: { create: (v: number) => track({ v }) },
      Point: { create: (x: number, y: number) => track({ x, y }) },
      Point2f: {
        // Native Point2fFactory truncates to int.
        create: (x: number, y: number) => track({ x: Math.trunc(x), y: Math.trunc(y) }),
      },
      Point2fVector: {
        create: () => {
          const items: unknown[] = [];
          return track({
            items,
            push: (p: { x: number; y: number }) => items.push({ x: p.x, y: p.y }),
            get length() {
              return items.length;
            },
          });
        },
      },
      getPerspectiveTransform: (from: { items: unknown[] }, to: { items: unknown[] }) => {
        if (from.items.length !== 4 || to.items.length !== 4) {
          throw new Error(
            "(-215:Assertion failed) src.checkVector(2, CV_32F) == 4 && dst.checkVector(2, CV_32F) == 4 in function 'getPerspectiveTransform'",
          );
        }
        perspectiveCalls.push({ from: [...from.items], to: [...to.items] });
        return mat();
      },
      PointVector: { create: () => pointVector() },
      PointVectorOfVectors: {
        create: () => {
          const items: ReturnType<typeof pointVector>[] = [];
          return track({
            items,
            get length() {
              return items.length;
            },
            get: (i: number) => items[i],
          });
        },
      },
      cvtColor: jest.fn(),
      Canny: (_src: MockMat, dst: MockMat) => {
        dst.tag = 'canny';
      },
      getStructuringElement: (_shape: unknown, size: { width: number }) =>
        Object.assign(mat(), { ksize: size.width }),
      dilate: (src: MockMat, dst: MockMat, kernel: MockMat) => {
        dst.tag = src.tag === 'canny' ? 'edges' + kernel.ksize : 'dilated-' + src.tag;
      },
      threshold: (_src: MockMat, dst: MockMat) => {
        dst.tag = 'otsu-raw';
      },
      morphologyEx: (src: MockMat, dst: MockMat) => {
        dst.tag = src.tag === 'otsu-raw' ? 'otsu' : 'closed-' + src.tag;
      },
      findContours: (src: MockMat, contours: { items: unknown[] }, mode: unknown) => {
        mockRetrievalModes.push(mode);
        for (const c of mockContours[src.tag ?? ''] ?? []) contours.items.push(pointVector([...c]));
      },
      arcLength: ({ points }: { points: MockPoint[] }) => {
        let sum = 0;
        for (let i = 0; i < points.length; i++) {
          const a = points[i];
          const b = points[(i + 1) % points.length];
          sum += Math.hypot(b.x - a.x, b.y - a.y);
        }
        return { value: sum };
      },
      approxPolyDP: (contour: { points: MockPoint[] }, approx: { points: MockPoint[] }) => {
        approx.points.push(...contour.points);
      },
      warpPerspective: (src: SizedMat, dst: SizedMat, _m: unknown, size: { width: number; height: number }) =>
        output('warp', src, dst, size.width, size.height),
      rotate: (src: SizedMat, dst: SizedMat, code: number) =>
        code === 1
          ? output('rotate', src, dst, src.cols, src.rows, [code])
          : output('rotate', src, dst, src.rows, src.cols, [code]),
      resize: (
        src: SizedMat,
        dst: SizedMat,
        size: { width: number; height: number },
        fx: number,
        fy: number,
        interpolation: number,
      ) => output('resize', src, dst, size.width, size.height, [fx, fy, interpolation]),
      GaussianBlur: (src: SizedMat, dst: SizedMat, _k: unknown, sigma: number) =>
        output('blur', src, dst, src.cols, src.rows, [sigma]),
      addWeighted: (a: SizedMat, alpha: number, b: SizedMat, beta: number, gamma: number, dst: SizedMat) =>
        output('addWeighted', a, dst, a.cols, a.rows, [alpha, b.id, beta, gamma]),
    },
  };
});


beforeEach(() => {
  mockContours.edges3 = [];
  mockContours.edges5 = [];
  mockContours.otsu = [];
  mockRetrievalModes.length = 0;
  created.length = 0;
  mockOps.length = 0;
  mockSource.cols = 4000;
  mockSource.rows = 3000;
  mockFailSave.value = false;
  perspectiveCalls.length = 0;
});

afterEach(() => {
});

describe('renderPage', () => {
  const OUT = 'file:///cache/page-1.jpg';
  const quad: Quad = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 0, y: 50 },
  ];
  const base = { maxEdge: 1920, outPath: OUT, quality: 0.95 };
  const opNames = () => mockOps.map((o) => o.op);

  it('passes 4 source and 4 destination points to getPerspectiveTransform', () => {
    renderPage('src-base64', { ...base, quad, rotation: 0 });
    expect(perspectiveCalls).toHaveLength(1);
    expect(perspectiveCalls[0].from).toEqual(quad);
    expect(perspectiveCalls[0].to).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ]);
  });

  it('rounds fractional corners to the nearest pixel (native Point2f truncates)', () => {
    const fractional: Quad = [
      { x: 0.6, y: 0.4 },
      { x: 99.7, y: 0.2 },
      { x: 99.5, y: 49.9 },
      { x: 0.1, y: 49.6 },
    ];
    renderPage('src-base64', { ...base, quad: fractional, rotation: 0 });
    expect(perspectiveCalls[0].from).toEqual([
      { x: 1, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ]);
  });

  it('without a quad: resizes (INTER_AREA) to Full HD, then sharpens, then writes the JPEG once', () => {
    const result = renderPage('src-base64', { ...base, quad: null, rotation: 0 });

    expect(opNames()).toEqual(['resize', 'blur', 'addWeighted', 'save']);
    const [resize, blur, sharpen, save] = mockOps;
    expect(resize).toMatchObject({ cols: 1920, rows: 1440, args: [0, 0, 3] });
    // The unsharp mask works on the resized image: 1.5·img − 0.5·blur(σ 1.0).
    expect(blur).toMatchObject({ src: resize.dst, args: [1] });
    expect(sharpen).toMatchObject({ src: resize.dst, args: [1.5, blur.dst, -0.5, 0] });
    expect(save).toEqual({
      op: 'save',
      src: sharpen.dst,
      cols: 1920,
      rows: 1440,
      args: [OUT, 'jpeg', 0.95],
    });
    expect(result).toEqual({
      input: { width: 4000, height: 3000 },
      output: { width: 1920, height: 1440 },
    });
  });

  it('never upscales a small image', () => {
    mockSource.cols = 1280;
    mockSource.rows = 960;
    const result = renderPage('src-base64', { ...base, quad: null, rotation: 0 });
    expect(opNames()).toEqual(['blur', 'addWeighted', 'save']);
    expect(result.output).toEqual({ width: 1280, height: 960 });
  });

  it('with a quad: warps, rotates, resizes, sharpens and writes, in that order', () => {
    mockSource.cols = 3000;
    mockSource.rows = 4000;
    const page: Quad = [
      { x: 0, y: 0 },
      { x: 2500, y: 0 },
      { x: 2500, y: 3500 },
      { x: 0, y: 3500 },
    ];
    const result = renderPage('src-base64', { ...base, quad: page, rotation: 90 });

    expect(opNames()).toEqual(['warp', 'rotate', 'resize', 'blur', 'addWeighted', 'save']);
    expect(mockOps[0]).toMatchObject({ cols: 2500, rows: 3500 });
    expect(mockOps[1]).toMatchObject({ cols: 3500, rows: 2500, args: [0] });
    expect(mockOps[2]).toMatchObject({ cols: 1920, rows: 1371, args: [0, 0, 3] });
    expect(result).toEqual({
      input: { width: 3000, height: 4000 },
      output: { width: 1920, height: 1371 },
    });
  });

  it('releases every native object it creates', () => {
    renderPage('src-base64', { ...base, quad, rotation: 90 });
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((o) => o.released)).toBe(true);
  });

  it('releases every native object when writing the file fails', () => {
    mockFailSave.value = true;
    expect(() => renderPage('src-base64', { ...base, quad: null, rotation: 0 })).toThrow(
      'Failed to save Mat to file',
    );
    expect(created.every((o) => o.released)).toBe(true);
  });
});

describe('detectQuad', () => {
  // An open Canny edge (the board's left + top border forming an "L") is traced by
  // findContours as an out-and-back, zero-area contour; approxPolyDP keeps 4 vertices with two
  // (nearly) coinciding. Re-ordered, it looks like a big triangle (device bug).
  const outAndBack = [
    { x: 25, y: 570 },
    { x: 20, y: 30 },
    { x: 780, y: 25 },
    { x: 21, y: 31 },
  ];
  // A page inside a small border (R11: ≥ 50 % of the image, corners within 15 % of the frame).
  const page = [
    { x: 740, y: 40 },
    { x: 50, y: 45 },
    { x: 45, y: 560 },
    { x: 750, y: 555 },
  ];
  const pageQuad = [
    { x: 50, y: 45 },
    { x: 740, y: 40 },
    { x: 750, y: 555 },
    { x: 45, y: 560 },
  ];

  it('returns the ordered page quad for a convex 4-vertex contour', () => {
    mockContours.edges3.push(page);
    expect(detectQuad('small-base64', 800, 600)).toEqual(pageQuad);
  });

  it('ignores an out-and-back (degenerate) contour', () => {
    mockContours.edges3.push(outAndBack);
    expect(detectQuad('small-base64', 800, 600)).toBeNull();
  });

  it('prefers a real page over a larger-looking degenerate contour', () => {
    mockContours.edges3.push(outAndBack, page);
    expect(detectQuad('small-base64', 800, 600)).toEqual(pageQuad);
  });

  it('accepts the true corners of an out-and-back trace listed in crossed order', () => {
    mockContours.edges3.push([page[0], page[2], page[1], page[3]]);
    expect(detectQuad('small-base64', 800, 600)).toEqual(pageQuad);
  });

  it('lists all contours (RETR_LIST), so an inner border can be found too', () => {
    mockContours.edges3.push(page);
    detectQuad('small-base64', 800, 600);
    expect(mockRetrievalModes).toEqual([1]);
  });

  it('falls back to an Otsu-thresholded pass when the edges yield no page', () => {
    mockContours.edges3.push(outAndBack);
    mockContours.otsu.push(page);
    expect(detectQuad('small-base64', 800, 600)).toEqual(pageQuad);
    expect(mockRetrievalModes).toEqual([1, 1, 1]);
  });

  it('tries a 5×5 dilation when the 3×3 pass yields no page', () => {
    mockContours.edges5.push(page);
    expect(detectQuad('small-base64', 800, 600)).toEqual(pageQuad);
    expect(mockRetrievalModes).toEqual([1, 1]);
  });

  it('stops at the first (3×3) pass that finds a page', () => {
    mockContours.edges3.push(page);
    mockContours.edges5.push([
      { x: 100, y: 50 },
      { x: 700, y: 50 },
      { x: 700, y: 550 },
      { x: 100, y: 550 },
    ]);
    expect(detectQuad('small-base64', 800, 600)).toEqual(pageQuad);
    expect(mockRetrievalModes).toEqual([1]);
  });

  it('logs a detection summary at debug level', () => {
    mockContours.edges3.push(page);
    detectQuad('small-base64', 800, 600);
    expect(log.debug).toHaveBeenCalledWith(
      '[detectQuad]',
      expect.objectContaining({ imageArea: 480000, chosenArea: expect.any(Number) }),
    );
  });

  it('ignores an inner rectangle such as a table (R11), even as the only candidate', () => {
    const table = [
      { x: 200, y: 110 },
      { x: 600, y: 100 },
      { x: 610, y: 490 },
      { x: 190, y: 500 },
    ];
    mockContours.edges3.push(table);
    mockContours.edges5.push(table);
    mockContours.otsu.push(table);
    expect(detectQuad('small-base64', 800, 600)).toBeNull();
  });

  it('ignores a concave 4-vertex contour', () => {
    mockContours.edges3.push([
      { x: 50, y: 50 },
      { x: 750, y: 300 },
      { x: 50, y: 550 },
      { x: 400, y: 300 },
    ]);
    expect(detectQuad('small-base64', 800, 600)).toBeNull();
  });

  it('releases every native object it creates', () => {
    mockContours.edges3.push(outAndBack, page);
    detectQuad('small-base64', 800, 600);
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((o) => o.released)).toBe(true);
  });
});
