import {
  Point,
  Quad,
  orderQuad,
  fullQuad,
  clampQuad,
  quadArea,
  warpSize,
  isFullQuad,
  isQuadUsable,
  scaleQuad,
} from '../../src/imaging/geometry';

describe('geometry', () => {
  describe('orderQuad', () => {
    it('sorts shuffled points', () => {
      const points: Point[] = [{ x: 90, y: 95 }, { x: 10, y: 5 }, { x: 5, y: 90 }, { x: 100, y: 8 }];
      const result = orderQuad(points);
      expect(result[0]).toEqual({ x: 10, y: 5 }); // TL
      expect(result[1]).toEqual({ x: 100, y: 8 }); // TR
      expect(result[2]).toEqual({ x: 90, y: 95 }); // BR
      expect(result[3]).toEqual({ x: 5, y: 90 }); // BL
    });

    it('orders crossed corners', () => {
      const points: Point[] = [{ x: 100, y: 100 }, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
      const result = orderQuad(points);
      const expected = fullQuad(100, 100);
      expect(result).toEqual(expected);
    });

    it('throws Error with QUAD_NEEDS_4_POINTS when not given exactly 4 points', () => {
      expect(() => orderQuad([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toThrow(
        new Error('QUAD_NEEDS_4_POINTS'),
      );
      expect(() => orderQuad([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }])).toThrow(
        new Error('QUAD_NEEDS_4_POINTS'),
      );
      expect(() => orderQuad([])).toThrow(new Error('QUAD_NEEDS_4_POINTS'));
    });
  });

  describe('fullQuad', () => {
    it('returns quad at corners of rectangle', () => {
      const result = fullQuad(100, 100);
      expect(result[0]).toEqual({ x: 0, y: 0 }); // TL
      expect(result[1]).toEqual({ x: 100, y: 0 }); // TR
      expect(result[2]).toEqual({ x: 100, y: 100 }); // BR
      expect(result[3]).toEqual({ x: 0, y: 100 }); // BL
    });
  });

  describe('clampQuad', () => {
    it('clamps point outside bounds', () => {
      const quad: Quad = [{ x: -5, y: -5 }, { x: 105, y: -5 }, { x: 105, y: 120 }, { x: -5, y: 120 }];
      const result = clampQuad(quad, 100, 100);
      expect(result[0]).toEqual({ x: 0, y: 0 }); // TL clamped from (-5,-5)
      expect(result[1]).toEqual({ x: 100, y: 0 }); // TR clamped from (105,-5)
      expect(result[2]).toEqual({ x: 100, y: 100 }); // BR clamped from (105,120)
      expect(result[3]).toEqual({ x: 0, y: 100 }); // BL clamped from (-5,120)
    });
  });

  describe('quadArea', () => {
    it('computes area of full quad', () => {
      const quad = fullQuad(100, 50);
      const result = quadArea(quad);
      expect(result).toBe(5000);
    });
  });

  describe('warpSize', () => {
    it('computes warp size for trapezoid', () => {
      const quad: Quad = [
        { x: 10, y: 0 }, // TL
        { x: 90, y: 0 }, // TR
        { x: 100, y: 50 }, // BR
        { x: 0, y: 50 }, // BL
      ];
      const result = warpSize(quad);
      // width: max(|TR-TL|, |BR-BL|) = max(80, 100) = 100
      // height: max(|BL-TL|, |BR-TR|) = max(50, √(100+2500)) = max(50, 50.99) ≈ 51
      expect(result.width).toBe(100);
      expect(result.height).toBe(51);
    });
  });

  describe('isFullQuad', () => {
    it('returns true for full quad within tolerance', () => {
      const quad = fullQuad(100, 100);
      expect(isFullQuad(quad, 100, 100, 2)).toBe(true);
    });

    it('returns false for full quad outside tolerance', () => {
      const quad: Quad = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 3, y: 100 }, // 3 px away from (0,100)
      ];
      expect(isFullQuad(quad, 100, 100, 2)).toBe(false);
    });
  });

  describe('isQuadUsable', () => {
    it('returns true for full quad', () => {
      const quad = fullQuad(100, 100);
      expect(isQuadUsable(quad, 100, 100)).toBe(true);
    });

    it('returns false for 20x20 quad in 100x100 (4% area)', () => {
      const quad: Quad = [
        { x: 40, y: 40 },
        { x: 60, y: 40 },
        { x: 60, y: 60 },
        { x: 40, y: 60 },
      ];
      expect(isQuadUsable(quad, 100, 100)).toBe(false);
    });

    it('returns true for 25x25 quad in 100x100 (6.25% area)', () => {
      const quad: Quad = [
        { x: 37.5, y: 37.5 },
        { x: 62.5, y: 37.5 },
        { x: 62.5, y: 62.5 },
        { x: 37.5, y: 62.5 },
      ];
      expect(isQuadUsable(quad, 100, 100)).toBe(true);
    });
  });

  describe('scaleQuad', () => {
    it('doubles coordinates when factor is 2', () => {
      const quad = fullQuad(50, 50);
      const result = scaleQuad(quad, 2);
      expect(result[0]).toEqual({ x: 0, y: 0 });
      expect(result[1]).toEqual({ x: 100, y: 0 });
      expect(result[2]).toEqual({ x: 100, y: 100 });
      expect(result[3]).toEqual({ x: 0, y: 100 });
    });
  });
});
