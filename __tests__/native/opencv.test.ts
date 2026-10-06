import { detectQuad, warpAndSharpen } from '../../src/native/opencv';
import type { Quad } from '../../src/imaging/geometry';

// Mirrors react-native-fast-opencv 1.0.1's native behaviour where it matters:
// cpp/structures/point2fVector/Point2fVectorFactory.cpp `create` IGNORES its arguments and
// always returns an empty vector; points must be added with `push`. getPerspectiveTransform
// asserts both inputs hold exactly 4 points (cv::getPerspectiveTransform checkVector == 4).
type Obj = { released: boolean; release(): void };
const created: Obj[] = [];
const perspectiveCalls: { from: unknown[]; to: unknown[] }[] = [];
// Contours that the mocked findContours reports; approxPolyDP returns each one unchanged.
type MockPoint = { x: number; y: number };
const mockContours: MockPoint[][] = [];

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
  const mat = () => track({ toBase64: () => 'sharpened-base64' });
  const pointVector = (points: MockPoint[] = []) =>
    track({
      points,
      get length() {
        return points.length;
      },
      getAll: () => points.map((p) => track({ x: p.x, y: p.y })),
    });
  return {
    BorderTypes: { BORDER_REPLICATE: 1 },
    ColorConversionCodes: {},
    ContourApproximationModes: {},
    DataTypes: { CV_8U: 0 },
    DecompTypes: { DECOMP_LU: 0 },
    InterpolationFlags: { INTER_LINEAR: 1 },
    RetrievalModes: {},
    RotateFlags: { ROTATE_90_CLOCKWISE: 0, ROTATE_180: 1, ROTATE_90_COUNTERCLOCKWISE: 2 },
    OpenCV: {
      Mat: { create: mat, createFromBase64: mat },
      Size: { create: (width: number, height: number) => track({ width, height }) },
      Scalar: { create: (v: number) => track({ v }) },
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
      Canny: jest.fn(),
      findContours: (_edges: unknown, contours: { items: unknown[] }) => {
        for (const c of mockContours) contours.items.push(pointVector([...c]));
      },
      arcLength: () => ({ value: 1000 }),
      approxPolyDP: (contour: { points: MockPoint[] }, approx: { points: MockPoint[] }) => {
        approx.points.push(...contour.points);
      },
      // |shoelace| in the contour's own vertex order, like cv::contourArea.
      contourArea: ({ points }: { points: MockPoint[] }) => {
        let sum = 0;
        for (let i = 0; i < points.length; i++) {
          const a = points[i];
          const b = points[(i + 1) % points.length];
          sum += a.x * b.y - b.x * a.y;
        }
        return { value: Math.abs(sum) / 2 };
      },
      warpPerspective: jest.fn(),
      rotate: jest.fn(),
      GaussianBlur: jest.fn(),
      addWeighted: jest.fn(),
    },
  };
});

beforeEach(() => {
  mockContours.length = 0;
  created.length = 0;
  perspectiveCalls.length = 0;
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
    mockContours.push(page);
    expect(detectQuad('small-base64', 800, 600)).toEqual([
      { x: 200, y: 110 },
      { x: 600, y: 100 },
      { x: 610, y: 490 },
      { x: 190, y: 500 },
    ]);
  });

  it('ignores an out-and-back (degenerate) contour', () => {
    mockContours.push(outAndBack);
    expect(detectQuad('small-base64', 800, 600)).toBeNull();
  });

  it('prefers a real page over a larger-looking degenerate contour', () => {
    mockContours.push(outAndBack, page);
    expect(detectQuad('small-base64', 800, 600)).toEqual([
      { x: 200, y: 110 },
      { x: 600, y: 100 },
      { x: 610, y: 490 },
      { x: 190, y: 500 },
    ]);
  });

  it('ignores a concave 4-vertex contour', () => {
    mockContours.push([
      { x: 50, y: 50 },
      { x: 750, y: 300 },
      { x: 50, y: 550 },
      { x: 400, y: 300 },
    ]);
    expect(detectQuad('small-base64', 800, 600)).toBeNull();
  });

  it('releases every native object it creates', () => {
    mockContours.push(outAndBack, page);
    detectQuad('small-base64', 800, 600);
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((o) => o.released)).toBe(true);
  });
});
