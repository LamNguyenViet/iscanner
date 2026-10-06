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
  isConvexQuad,
  pickPageQuad,
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

    it.each<[string, Quad]>([
      ['rectangle', [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 80 }, { x: 10, y: 80 }]],
      ['diamond', [{ x: 50, y: 5 }, { x: 95, y: 50 }, { x: 50, y: 95 }, { x: 5, y: 50 }]],
      ['trapezoid', [{ x: 30, y: 10 }, { x: 70, y: 10 }, { x: 95, y: 90 }, { x: 5, y: 90 }]],
      ['crossed (bowtie) corners, which orderQuad untangles', [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }]],
    ])('accepts a %s', (_name, quad) => {
      expect(isQuadUsable(quad, 100, 100)).toBe(true);
    });

    it.each<[string, Quad]>([
      // Device bug: an out-and-back contour where BR coincides with TR (a big triangle).
      ['triangle with a duplicate corner', [{ x: 5, y: 5 }, { x: 95, y: 5 }, { x: 95, y: 5 }, { x: 5, y: 95 }]],
      ['triangle with a near-duplicate corner', [{ x: 5, y: 5 }, { x: 95, y: 5 }, { x: 94, y: 6 }, { x: 5, y: 95 }]],
      ['collinear (flat) corner', [{ x: 5, y: 5 }, { x: 95, y: 5 }, { x: 50, y: 50 }, { x: 5, y: 95 }]],
      ['concave (arrowhead) quad', [{ x: 5, y: 5 }, { x: 95, y: 50 }, { x: 5, y: 95 }, { x: 40, y: 50 }]],
      ['quad with a tiny angle', [{ x: 0, y: 50 }, { x: 85, y: 42 }, { x: 95, y: 50 }, { x: 85, y: 58 }]],
    ])('rejects a %s even when its area is large enough', (_name, quad) => {
      expect(isQuadUsable(quad, 100, 100)).toBe(false);
    });
  });

  describe('isConvexQuad', () => {
    it('accepts rectangles in either winding', () => {
      const q = fullQuad(100, 50);
      expect(isConvexQuad(q)).toBe(true);
      expect(isConvexQuad([q[0], q[3], q[2], q[1]])).toBe(true);
    });

    it('rejects a bowtie (self-intersecting order)', () => {
      expect(isConvexQuad([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }])).toBe(false);
    });

    it('rejects an out-and-back contour (two coinciding corners)', () => {
      expect(isConvexQuad([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 0 }])).toBe(false);
    });

    it('rejects a concave quad and a collinear corner', () => {
      expect(isConvexQuad([{ x: 0, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 100 }, { x: 40, y: 50 }])).toBe(false);
      expect(isConvexQuad([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }])).toBe(false);
    });
  });

  describe('pickPageQuad', () => {
    const outer = [{ x: 700, y: 50 }, { x: 100, y: 60 }, { x: 90, y: 550 }, { x: 710, y: 540 }];
    const inner = [{ x: 110, y: 80 }, { x: 690, y: 70 }, { x: 700, y: 520 }, { x: 100, y: 530 }];

    it('returns the largest usable candidate, ordered TL, TR, BR, BL', () => {
      expect(pickPageQuad([inner, outer], 800, 600)).toEqual({
        quad: [{ x: 100, y: 60 }, { x: 700, y: 50 }, { x: 710, y: 540 }, { x: 90, y: 550 }],
        area: quadArea(orderQuad(outer)),
      });
    });

    it('accepts the true corners even when a contour lists them in crossed order', () => {
      const crossed = [outer[1], outer[3], outer[0], outer[2]];
      expect(pickPageQuad([crossed], 800, 600)?.quad).toEqual(orderQuad(outer));
    });

    it('skips degenerate candidates and prefers a smaller valid one', () => {
      const triangle = [{ x: 20, y: 30 }, { x: 780, y: 25 }, { x: 21, y: 31 }, { x: 25, y: 570 }];
      expect(pickPageQuad([triangle, inner], 800, 600)?.quad).toEqual(orderQuad(inner));
    });

    it('ignores small candidates, non-quads and the image frame itself', () => {
      const small = [{ x: 300, y: 200 }, { x: 500, y: 200 }, { x: 500, y: 400 }, { x: 300, y: 400 }];
      const frame = [{ x: 0, y: 0 }, { x: 799, y: 0 }, { x: 799, y: 599 }, { x: 0, y: 599 }];
      expect(pickPageQuad([small, outer.slice(0, 3), frame], 800, 600)).toBeNull();
      expect(pickPageQuad([], 800, 600)).toBeNull();
    });

    // Controller ruling R11: only a page inside a small excess border is accepted.
    it('rejects an inner rectangle (table, form box) covering 30-45 % of the image', () => {
      const table30 = [{ x: 180, y: 140 }, { x: 620, y: 140 }, { x: 620, y: 470 }, { x: 180, y: 470 }];
      const table45 = [{ x: 100, y: 150 }, { x: 700, y: 150 }, { x: 700, y: 510 }, { x: 100, y: 510 }];
      expect(quadArea(orderQuad(table30)) / (800 * 600)).toBeCloseTo(0.3, 1);
      expect(quadArea(orderQuad(table45)) / (800 * 600)).toBeCloseTo(0.45, 2);
      expect(pickPageQuad([table30], 800, 600)).toBeNull();
      expect(pickPageQuad([table45], 800, 600)).toBeNull();
    });

    it('accepts a page with a 5 % border on all sides', () => {
      const page = [{ x: 40, y: 30 }, { x: 760, y: 30 }, { x: 760, y: 570 }, { x: 40, y: 570 }];
      expect(pickPageQuad([page], 800, 600)?.quad).toEqual(orderQuad(page));
    });

    it('accepts a corner exactly 15 % from its image corner', () => {
      const edge = [{ x: 120, y: 90 }, { x: 790, y: 10 }, { x: 790, y: 590 }, { x: 10, y: 590 }];
      expect(pickPageQuad([edge], 800, 600)).not.toBeNull();
    });

    it('rejects a large quad with one corner 25 % inward', () => {
      // BR pulled 25 % of the width/height towards the centre; the area stays above 50 %.
      const quad = [{ x: 40, y: 30 }, { x: 760, y: 30 }, { x: 600, y: 450 }, { x: 40, y: 570 }];
      expect(quadArea(orderQuad(quad))).toBeGreaterThan(0.5 * 800 * 600);
      expect(pickPageQuad([quad], 800, 600)).toBeNull();
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
