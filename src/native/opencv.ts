import {
  BorderTypes,
  ColorConversionCodes,
  ContourApproximationModes,
  DataTypes,
  DecompTypes,
  InterpolationFlags,
  OpenCV,
  RetrievalModes,
  RotateFlags,
  type Mat,
} from 'react-native-fast-opencv';
import { orderQuad, quadArea, warpSize, type Point, type Quad } from '../imaging/geometry';

/** Clockwise rotation in degrees. */
export type Rotation = 0 | 90 | 180 | 270;

const MIN_AREA_RATIO = 0.2;
const CANNY_LOW = 75;
const CANNY_HIGH = 200;
const APPROX_EPSILON = 0.02;
const SHARPEN_SIGMA = 1.0;

type Releasable = { release(): void };

/** Collects native objects so they can all be released in a `finally`. */
function createPool() {
  const items: Releasable[] = [];
  return {
    add<T extends Releasable>(item: T): T {
      items.push(item);
      return item;
    },
    releaseAll() {
      for (const item of items.reverse()) item.release();
    },
  };
}

type Pool = ReturnType<typeof createPool>;

const emptyMat = (pool: Pool): Mat => pool.add(OpenCV.Mat.create(0, 0, DataTypes.CV_8U));

/**
 * Finds the document quadrilateral (TL, TR, BR, BL) in an image, in that image's pixel
 * coordinates. Callers pass a downscaled copy (long edge ~800 px) and scale the result back.
 * Returns null when no 4-vertex contour covers at least 20 % of the image.
 */
export function detectQuad(base64Jpeg: string, width: number, height: number): Quad | null {
  const pool = createPool();
  try {
    const src = pool.add(OpenCV.Mat.createFromBase64(base64Jpeg));
    const gray = emptyMat(pool);
    const blurred = emptyMat(pool);
    const edges = emptyMat(pool);
    // JPEG decodes to 3-channel BGR.
    OpenCV.cvtColor(src, gray, ColorConversionCodes.COLOR_BGR2GRAY);
    OpenCV.GaussianBlur(gray, blurred, pool.add(OpenCV.Size.create(5, 5)), 0);
    OpenCV.Canny(blurred, edges, CANNY_LOW, CANNY_HIGH);

    const contours = pool.add(OpenCV.PointVectorOfVectors.create());
    OpenCV.findContours(
      edges,
      contours,
      RetrievalModes.RETR_EXTERNAL,
      ContourApproximationModes.CHAIN_APPROX_SIMPLE,
    );

    let best: Quad | null = null;
    let bestArea = MIN_AREA_RATIO * width * height;
    for (let i = 0; i < contours.length; i++) {
      const contour = pool.add(contours.get(i));
      const perimeter = OpenCV.arcLength(contour, true).value;
      const approx = pool.add(OpenCV.PointVector.create());
      OpenCV.approxPolyDP(contour, approx, APPROX_EPSILON * perimeter, true);
      if (approx.length !== 4) continue;

      const points = approx.getAll().map((p) => {
        pool.add(p);
        return { x: p.x, y: p.y };
      });
      const quad = orderQuad(points);
      const area = quadArea(quad);
      if (area >= bestArea) {
        best = quad;
        bestArea = area;
      }
    }
    return best;
  } finally {
    pool.releaseAll();
  }
}

/**
 * Builds a native Point2fVector. In react-native-fast-opencv 1.0.1 `Point2fVector.create`
 * ignores its (typed) `points` argument and always returns an empty vector, so points must be
 * `push`ed. `Point2f.create` truncates to int natively, so coordinates are rounded first.
 */
function point2fVector(pool: Pool, points: readonly Point[]) {
  const vector = pool.add(OpenCV.Point2fVector.create());
  for (const p of points) {
    vector.push(pool.add(OpenCV.Point2f.create(Math.round(p.x), Math.round(p.y))));
  }
  return vector;
}

const ROTATE_FLAGS: Record<Exclude<Rotation, 0>, RotateFlags> = {
  90: RotateFlags.ROTATE_90_CLOCKWISE,
  180: RotateFlags.ROTATE_180,
  270: RotateFlags.ROTATE_90_COUNTERCLOCKWISE,
};

/**
 * Perspective-warps `quad` (source pixel coordinates) to a rectangle, rotates it clockwise by
 * `rotation`, and applies an unsharp mask (1.5·img − 0.5·GaussianBlur(σ 1.0)).
 * Returns the result as a base64 JPEG.
 */
export function warpAndSharpen(base64Jpeg: string, quad: Quad, rotation: Rotation): string {
  const pool = createPool();
  try {
    const src = pool.add(OpenCV.Mat.createFromBase64(base64Jpeg));
    const { width, height } = warpSize(quad);

    const from = point2fVector(pool, quad);
    const to = point2fVector(pool, [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ]);
    const transform = pool.add(OpenCV.getPerspectiveTransform(from, to, DecompTypes.DECOMP_LU));

    const warped = emptyMat(pool);
    OpenCV.warpPerspective(
      src,
      warped,
      transform,
      pool.add(OpenCV.Size.create(width, height)),
      InterpolationFlags.INTER_LINEAR,
      BorderTypes.BORDER_REPLICATE,
      pool.add(OpenCV.Scalar.create(0)),
    );

    let oriented = warped;
    if (rotation !== 0) {
      oriented = emptyMat(pool);
      OpenCV.rotate(warped, oriented, ROTATE_FLAGS[rotation]);
    }

    const blurred = emptyMat(pool);
    OpenCV.GaussianBlur(oriented, blurred, pool.add(OpenCV.Size.create(0, 0)), SHARPEN_SIGMA);
    const sharpened = emptyMat(pool);
    OpenCV.addWeighted(oriented, 1.5, blurred, -0.5, 0, sharpened);

    return sharpened.toBase64();
  } finally {
    pool.releaseAll();
  }
}
