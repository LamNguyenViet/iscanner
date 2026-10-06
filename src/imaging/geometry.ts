export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point]; // TL, TR, BR, BL

/**
 * Orders 4 points into a canonical quad: [TL, TR, BR, BL]
 * Algorithm:
 * 1. Compute centroid of the 4 points
 * 2. Sort by angle from centroid (ascending) → clockwise order: TL→TR→BR→BL
 * 3. Rotate sorted array to start at the point with min(x+y), breaking ties with smaller x
 * Works with indices to avoid object identity issues; returns new Point objects.
 */
export function orderQuad(points: Point[]): Quad {
  if (points.length !== 4) {
    throw new Error('QUAD_NEEDS_4_POINTS');
  }

  // Compute centroid
  let cx = 0,
    cy = 0;
  for (let i = 0; i < 4; i++) {
    cx += points[i].x;
    cy += points[i].y;
  }
  cx /= 4;
  cy /= 4;

  // Create indices array and sort by angle (clockwise from centroid)
  const indices = [0, 1, 2, 3];
  indices.sort((i, j) => {
    const angleI = Math.atan2(points[i].y - cy, points[i].x - cx);
    const angleJ = Math.atan2(points[j].y - cy, points[j].x - cx);
    return angleI - angleJ;
  });

  // Find the index in the sorted array where min(x+y) point is, breaking ties by smaller x
  let minIdx = 0;
  let minSum = points[indices[0]].x + points[indices[0]].y;
  let minX = points[indices[0]].x;
  for (let i = 1; i < 4; i++) {
    const sum = points[indices[i]].x + points[indices[i]].y;
    const x = points[indices[i]].x;
    if (sum < minSum || (sum === minSum && x < minX)) {
      minSum = sum;
      minIdx = i;
      minX = x;
    }
  }

  // Rotate sorted array to start at minIdx (TL position)
  const sorted = [
    points[indices[minIdx]],
    points[indices[(minIdx + 1) % 4]],
    points[indices[(minIdx + 2) % 4]],
    points[indices[(minIdx + 3) % 4]],
  ];

  // Return new point objects to avoid identity/reference issues
  return [
    { x: sorted[0].x, y: sorted[0].y },
    { x: sorted[1].x, y: sorted[1].y },
    { x: sorted[2].x, y: sorted[2].y },
    { x: sorted[3].x, y: sorted[3].y },
  ];
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

const MIN_AREA_RATIO = 0.05;
const MIN_CORNER_GAP_RATIO = 0.02; // of the image diagonal
const MIN_ANGLE_DEG = 15;
const MAX_ANGLE_DEG = 165;

/** z of the cross product (b - a) × (c - b): the turn direction at b. */
function turn(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
}

/**
 * True when the quad, taken in the given vertex order, is a strictly convex polygon: every
 * corner turns the same way and none is flat. Rejects bowties, concave quads, collinear
 * corners and coinciding corners.
 */
export function isConvexQuad(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const t = turn(q[i], q[(i + 1) % 4], q[(i + 2) % 4]);
    if (t === 0) return false;
    const s = Math.sign(t);
    if (sign !== 0 && s !== sign) return false;
    sign = s;
  }
  return true;
}

/** Interior angle at `b` (degrees) between the edges to its neighbours `a` and `c`. */
function cornerAngle(a: Point, b: Point, c: Point): number {
  const ux = a.x - b.x;
  const uy = a.y - b.y;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  const lengths = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (lengths === 0) return 0;
  const cos = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / lengths));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Checks if a quad can be cropped to: after `orderQuad`, it must cover at least 5 % of the
 * w×h image, be strictly convex, keep every pair of corners at least 2 % of the image
 * diagonal apart, and have every interior angle within [15°, 165°]. Rejects degenerate
 * detections such as a triangle with two coinciding corners.
 */
export function isQuadUsable(q: Quad, w: number, h: number): boolean {
  const ordered = orderQuad(q);
  if (quadArea(ordered) < MIN_AREA_RATIO * w * h) return false;
  if (!isConvexQuad(ordered)) return false;

  const minGap = MIN_CORNER_GAP_RATIO * Math.hypot(w, h);
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      if (Math.hypot(ordered[i].x - ordered[j].x, ordered[i].y - ordered[j].y) < minGap) {
        return false;
      }
    }
  }

  for (let i = 0; i < 4; i++) {
    const angle = cornerAngle(ordered[(i + 3) % 4], ordered[i], ordered[(i + 1) % 4]);
    if (angle < MIN_ANGLE_DEG || angle > MAX_ANGLE_DEG) return false;
  }
  return true;
}

export const PAGE_MIN_AREA_RATIO = 0.5;
const PAGE_CORNER_REACH_RATIO = 0.15; // of the image width / height
const FRAME_TOLERANCE_RATIO = 0.02; // of the image's short edge

/**
 * Controller ruling R11: scanner output is already cropped, so a detected quad is only
 * plausible as "the page inside a small excess border": it covers at least 50 % of the w×h
 * image and each ordered corner (TL, TR, BR, BL) lies within 15 % of the image width/height
 * of the matching image corner. Inner rectangles (tables, form boxes, photos) fail this.
 */
export function isPageInBorder(q: Quad, w: number, h: number): boolean {
  if (quadArea(q) < PAGE_MIN_AREA_RATIO * w * h) return false;
  const maxDx = PAGE_CORNER_REACH_RATIO * w;
  const maxDy = PAGE_CORNER_REACH_RATIO * h;
  return fullQuad(w, h).every(
    (corner, i) => Math.abs(q[i].x - corner.x) <= maxDx && Math.abs(q[i].y - corner.y) <= maxDy,
  );
}

/**
 * Chooses the page among detected 4-vertex candidates (w×h image coordinates, any vertex
 * order): each is ordered, must pass `isQuadUsable` and `isPageInBorder` (R11) and not be the
 * image frame itself; the largest wins. Vertex order is deliberately ignored, because a
 * contour traced out and back along an open border can list the true corners in crossed order.
 */
export function pickPageQuad(
  candidates: readonly (readonly Point[])[],
  w: number,
  h: number,
): { quad: Quad; area: number } | null {
  const frameTolerance = Math.max(2, FRAME_TOLERANCE_RATIO * Math.min(w, h));
  let best: { quad: Quad; area: number } | null = null;
  for (const points of candidates) {
    if (points.length !== 4) continue;
    const quad = orderQuad([...points]);
    const area = quadArea(quad);
    if (best && area <= best.area) continue;
    if (!isPageInBorder(quad, w, h)) continue;
    if (!isQuadUsable(quad, w, h) || isFullQuad(quad, w, h, frameTolerance)) continue;
    best = { quad, area };
  }
  return best;
}

/** Scales a size so its long edge is at most `maxEdge` (rounded); never upscales. */
export function fitLongEdge(
  size: { width: number; height: number },
  maxEdge: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(size.width, size.height));
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
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
