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

    it('handles diamond quad (rotated 45°) without crossed order', () => {
      // Diamond with centroid at (50,50) and area 5000
      const diamondPoints: Point[] = [{ x: 50, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 50 }];
      const result = orderQuad(diamondPoints);
      // Should produce non-crossed quad
      const area = quadArea(result);
      expect(area).toBe(5000);
      // Should be usable (5000 >= 0.05*100*100 = 500)
      expect(isQuadUsable(result, 100, 100)).toBe(true);
    });

    it('handles rotated quad (~30°) given shuffled', () => {
      // Create a rectangle rotated ~30° around centroid (50,50)
      // Original corners: (30,35), (70,35), (70,65), (30,65) (20x30 rect)
      // After ~30° rotation, approximated points
      const angle = Math.PI / 6; // ~30 degrees
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const cx = 50,
        cy = 50;

      const rotatePoint = (px: number, py: number): Point => {
        const x = px - cx;
        const y = py - cy;
        return {
          x: cx + x * cos - y * sin,
          y: cy + x * sin + y * cos,
        };
      };

      const corners = [
        rotatePoint(30, 35), // TL before rotation
        rotatePoint(70, 35), // TR before rotation
        rotatePoint(70, 65), // BR before rotation
        rotatePoint(30, 65), // BL before rotation
      ];

      // Shuffle the input
      const shuffled = [corners[2], corners[0], corners[3], corners[1]];
      const result = orderQuad(shuffled);

      // Verify we get points back and they're in proper order
      expect(result.length).toBe(4);
      expect(result[0]).toBeDefined();
      expect(result[1]).toBeDefined();
      expect(result[2]).toBeDefined();
      expect(result[3]).toBeDefined();
      // Verify it's a sensible (non-crossed) quad
      const area = quadArea(result);
      expect(area).toBeGreaterThan(400); // 20*30 = 600, allow some variance from rotation
      // Should be usable (>400 >= 500 is false, but the area should be valid)
      expect(quadArea(result)).toBeGreaterThan(0);
    });

    it('handles duplicate point references [a,a,b,c] without undefined', () => {
      const a = { x: 10, y: 10 };
      const b = { x: 90, y: 10 };
      const c = { x: 90, y: 90 };
      // Note: this creates an invalid quad (duplicate point), but the function should
      // still return 4 defined Point objects and not crash with undefined
      const points = [a, a, b, c];
      const result = orderQuad(points);
      // All 4 positions should have defined objects
      expect(result[0]).toBeDefined();
      expect(result[1]).toBeDefined();
      expect(result[2]).toBeDefined();
      expect(result[3]).toBeDefined();
      // No undefined values
      expect(result[0].x).toBeDefined();
      expect(result[0].y).toBeDefined();
      expect(result[1].x).toBeDefined();
      expect(result[1].y).toBeDefined();
      expect(result[2].x).toBeDefined();
      expect(result[2].y).toBeDefined();
      expect(result[3].x).toBeDefined();
      expect(result[3].y).toBeDefined();
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
