export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point]; // TL, TR, BR, BL

/**
 * Orders 4 points into a canonical quad: [TL, TR, BR, BL]
 * TL = min(x+y) (top-left diagonal sum)
 * BR = max(x+y) (bottom-right diagonal sum)
 * TR = min(y-x) (top-right diagonal difference)
 * BL = max(y-x) (bottom-left diagonal difference)
 */
export function orderQuad(points: Point[]): Quad {
  if (points.length !== 4) {
    throw new Error('QUAD_NEEDS_4_POINTS');
  }

  // Calculate diagonal sums and differences for each point
  const pointsWithDiagonals = points.map(p => ({
    point: p,
    sum: p.x + p.y,
    diff: p.y - p.x,
  }));

  // Find TL (min sum) and BR (max sum)
  const tl = pointsWithDiagonals.reduce((min, p) => (p.sum < min.sum ? p : min));
  const br = pointsWithDiagonals.reduce((max, p) => (p.sum > max.sum ? p : max));

  // Find TR (min diff) and BL (max diff) from remaining points
  const remaining = pointsWithDiagonals.filter(p => p.point !== tl.point && p.point !== br.point);
  const tr = remaining.reduce((min, p) => (p.diff < min.diff ? p : min));
  const bl = remaining.find(p => p.point !== tr.point)!;

  return [tl.point, tr.point, br.point, bl.point];
}

/**
 * Creates a quad representing the full rectangle [0,0] to [w,h]
 */
export function fullQuad(w: number, h: number): Quad {
  return [
    { x: 0, y: 0 }, // TL
    { x: w, y: 0 }, // TR
    { x: w, y: h }, // BR
    { x: 0, y: h }, // BL
  ];
}

/**
 * Clamps all points of a quad to the rectangle [0,w] x [0,h]
 */
export function clampQuad(q: Quad, w: number, h: number): Quad {
  return q.map(p => ({
    x: Math.max(0, Math.min(w, p.x)),
    y: Math.max(0, Math.min(h, p.y)),
  })) as Quad;
}

/**
 * Computes the area of a quad using the shoelace formula
 */
export function quadArea(q: Quad): number {
  const [p0, p1, p2, p3] = q;
  const sum =
    p0.x * (p1.y - p3.y) +
    p1.x * (p2.y - p0.y) +
    p2.x * (p3.y - p1.y) +
    p3.x * (p0.y - p2.y);
  return Math.abs(sum) / 2;
}

/**
 * Computes the width and height of the warped image
 * width: max(|TR-TL|, |BR-BL|) rounded
 * height: max(|BL-TL|, |BR-TR|) rounded
 */
export function warpSize(q: Quad): { width: number; height: number } {
  const [tl, tr, br, bl] = q;

  // Distance between two points
  const distance = (p1: Point, p2: Point) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const topWidth = distance(tl, tr);
  const bottomWidth = distance(bl, br);
  const leftHeight = distance(tl, bl);
  const rightHeight = distance(tr, br);

  return {
    width: Math.round(Math.max(topWidth, bottomWidth)),
    height: Math.round(Math.max(leftHeight, rightHeight)),
  };
}

/**
 * Checks if a quad is the full rectangle within a tolerance in pixels
 */
export function isFullQuad(
  q: Quad,
  w: number,
  h: number,
  tolerancePx: number = 2,
): boolean {
  const [tl, tr, br, bl] = q;
  const tolerance = tolerancePx;

  return (
    Math.abs(tl.x - 0) <= tolerance &&
    Math.abs(tl.y - 0) <= tolerance &&
    Math.abs(tr.x - w) <= tolerance &&
    Math.abs(tr.y - 0) <= tolerance &&
    Math.abs(br.x - w) <= tolerance &&
    Math.abs(br.y - h) <= tolerance &&
    Math.abs(bl.x - 0) <= tolerance &&
    Math.abs(bl.y - h) <= tolerance
  );
}

/**
 * Checks if a quad has enough area to be usable
 * Requires: quadArea(orderQuad(q)) >= 0.05 * w * h
 */
export function isQuadUsable(q: Quad, w: number, h: number): boolean {
  const ordered = orderQuad(q);
  const area = quadArea(ordered);
  const minArea = 0.05 * w * h;
  return area >= minArea;
}

/**
 * Scales all coordinates of a quad by a factor
 */
export function scaleQuad(q: Quad, factor: number): Quad {
  return q.map(p => ({
    x: p.x * factor,
    y: p.y * factor,
  })) as Quad;
}
