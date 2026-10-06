import { detectQuad, warpAndSharpen } from '../../src/native/opencv';
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
  const mat = () => track({ toBase64: () => 'sharpened-base64', tag: undefined as string | undefined });
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
    InterpolationFlags: { INTER_LINEAR: 1 },
    MorphShapes: { MORPH_RECT: 0 },
    MorphTypes: { MORPH_CLOSE: 3 },
    RetrievalModes: { RETR_LIST: 1 },
    ThresholdTypes: { THRESH_BINARY: 0, THRESH_OTSU: 8 },
    RotateFlags: { ROTATE_90_CLOCKWISE: 0, ROTATE_180: 1, ROTATE_90_COUNTERCLOCKWISE: 2 },
    OpenCV: {
      Mat: { create: mat, createFromBase64: mat },
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
      warpPerspective: jest.fn(),
      rotate: jest.fn(),
      GaussianBlur: jest.fn(),
      addWeighted: jest.fn(),
    },
  };
});

let logSpy: jest.SpyInstance;

beforeEach(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  mockContours.edges3 = [];
  mockContours.edges5 = [];
  mockContours.otsu = [];
  mockRetrievalModes.length = 0;
  created.length = 0;
  perspectiveCalls.length = 0;
});

afterEach(() => {
  logSpy.mockRestore();
});

describe('warpAndSharpen', () => {
  const quad: Quad = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 0, y: 50 },
  ];

  it('passes 4 source and 4 destination points to getPerspectiveTransform', () => {
    expect(warpAndSharpen('src-base64', quad, 0)).toBe('sharpened-base64');
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
    warpAndSharpen('src-base64', fractional, 0);
    expect(perspectiveCalls[0].from).toEqual([
      { x: 1, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ]);
  });

  it('releases every native object it creates', () => {
    warpAndSharpen('src-base64', quad, 90);
    expect(created.length).toBeGreaterThan(0);
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
  const page = [
    { x: 600, y: 100 },
    { x: 200, y: 110 },
    { x: 190, y: 500 },
    { x: 610, y: 490 },
  ];

  it('returns the ordered page quad for a convex 4-vertex contour', () => {
    mockContours.edges3.push(page);
    expect(detectQuad('small-base64', 800, 600)).toEqual([
      { x: 200, y: 110 },
      { x: 600, y: 100 },
      { x: 610, y: 490 },
      { x: 190, y: 500 },
    ]);
  });

  it('ignores an out-and-back (degenerate) contour', () => {
    mockContours.edges3.push(outAndBack);
    expect(detectQuad('small-base64', 800, 600)).toBeNull();
  });

  it('prefers a real page over a larger-looking degenerate contour', () => {
    mockContours.edges3.push(outAndBack, page);
    expect(detectQuad('small-base64', 800, 600)).toEqual([
      { x: 200, y: 110 },
      { x: 600, y: 100 },
      { x: 610, y: 490 },
      { x: 190, y: 500 },
    ]);
  });

  it('accepts the true corners of an out-and-back trace listed in crossed order', () => {
    mockContours.edges3.push([page[0], page[2], page[1], page[3]]);
    expect(detectQuad('small-base64', 800, 600)).toEqual([
      { x: 200, y: 110 },
      { x: 600, y: 100 },
      { x: 610, y: 490 },
      { x: 190, y: 500 },
    ]);
  });

  it('lists all contours (RETR_LIST), so an inner border can be found too', () => {
    mockContours.edges3.push(page);
    detectQuad('small-base64', 800, 600);
    expect(mockRetrievalModes).toEqual([1]);
  });

  it('falls back to an Otsu-thresholded pass when the edges yield no page', () => {
    mockContours.edges3.push(outAndBack);
    mockContours.otsu.push(page);
    expect(detectQuad('small-base64', 800, 600)).toEqual([
      { x: 200, y: 110 },
      { x: 600, y: 100 },
      { x: 610, y: 490 },
      { x: 190, y: 500 },
    ]);
    expect(mockRetrievalModes).toEqual([1, 1, 1]);
  });

  it('tries a 5×5 dilation when the 3×3 pass yields no page', () => {
    mockContours.edges5.push(page);
    expect(detectQuad('small-base64', 800, 600)).toEqual([
      { x: 200, y: 110 },
      { x: 600, y: 100 },
      { x: 610, y: 490 },
      { x: 190, y: 500 },
    ]);
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
    expect(detectQuad('small-base64', 800, 600)?.[0]).toEqual({ x: 200, y: 110 });
    expect(mockRetrievalModes).toEqual([1]);
  });

  it('logs a detection summary in development', () => {
    mockContours.edges3.push(page);
    detectQuad('small-base64', 800, 600);
    expect(logSpy).toHaveBeenCalledWith(
      '[detectQuad]',
      expect.objectContaining({ imageArea: 480000, chosenArea: expect.any(Number) }),
    );
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
