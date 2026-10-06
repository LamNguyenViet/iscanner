import { warpAndSharpen } from '../../src/native/opencv';
import type { Quad } from '../../src/imaging/geometry';

// Mirrors react-native-fast-opencv 1.0.1's native behaviour where it matters:
// cpp/structures/point2fVector/Point2fVectorFactory.cpp `create` IGNORES its arguments and
// always returns an empty vector; points must be added with `push`. getPerspectiveTransform
// asserts both inputs hold exactly 4 points (cv::getPerspectiveTransform checkVector == 4).
type Obj = { released: boolean; release(): void };
const created: Obj[] = [];
const perspectiveCalls: { from: unknown[]; to: unknown[] }[] = [];

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
      warpPerspective: jest.fn(),
      rotate: jest.fn(),
      GaussianBlur: jest.fn(),
      addWeighted: jest.fn(),
    },
  };
});

beforeEach(() => {
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
