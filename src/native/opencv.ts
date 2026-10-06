import {
  BorderTypes,
  ColorConversionCodes,
  ContourApproximationModes,
  DataTypes,
  DecompTypes,
  InterpolationFlags,
  MorphShapes,
  MorphTypes,
  OpenCV,
  RetrievalModes,
  RotateFlags,
  ThresholdTypes,
  type Mat,
} from 'react-native-fast-opencv';
import { pickPageQuad, warpSize, type Point, type Quad } from '../imaging/geometry';

/** Clockwise rotation in degrees. */
export type Rotation = 0 | 90 | 180 | 270;

const MIN_AREA_RATIO = 0.2;
const CANNY_LOW = 75;
const CANNY_HIGH = 200;
// Dilation kernels (px) tried in order to close gaps in the Canny edges. The detection copy is
// at most 800 px but often much smaller (~370 px on the emulator), where 5×5 already welds a
// checkerboard, its frame and the wall texture into one blob that touches the image border.
const GAP_KERNELS = [3, 5];
const OTSU_CLOSE_KERNEL = 5;
const APPROX_EPSILONS = [0.02, 0.04]; // × contour perimeter
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
 * Returns null when no usable quad (see `pickPageQuad`) covers at least 20 % of the image.
 *
 * Canny often leaves the page border as an OPEN curve with small gaps, which findContours
 * traces out and back: approxPolyDP then yields too many vertices or two coinciding ones. So
 * the edges are dilated to close those gaps (3×3 first, then 5×5; too large a kernel merges the
 * page with its surroundings), and every contour (RETR_LIST, so the inner edge of a framed page
 * counts too) is approximated at two tolerances. The first pass that finds a page wins; an
 * Otsu-binarized pass is the last resort.
 */
export function detectQuad(base64Jpeg: string, width: number, height: number): Quad | null {
  const pool = createPool();
  try {
    const src = pool.add(OpenCV.Mat.createFromBase64(base64Jpeg));
    const gray = emptyMat(pool);
    const blurred = emptyMat(pool);
    // JPEG decodes to 3-channel BGR.
    OpenCV.cvtColor(src, gray, ColorConversionCodes.COLOR_BGR2GRAY);
    OpenCV.GaussianBlur(gray, blurred, pool.add(OpenCV.Size.create(5, 5)), 0);
    const edges = emptyMat(pool);
    OpenCV.Canny(blurred, edges, CANNY_LOW, CANNY_HIGH);

    const passes: string[] = [];
    let candidates = 0;
    const tryPass = (name: string, binary: Mat) => {
      const found = quadCandidates(pool, binary, width, height);
      passes.push(name);
      candidates += found.length;
      return pickPageQuad(found, width, height);
    };

    let best: ReturnType<typeof pickPageQuad> = null;
    for (const size of GAP_KERNELS) {
      const closedEdges = emptyMat(pool);
      OpenCV.dilate(
        edges,
        closedEdges,
        rectKernel(pool, size),
        pool.add(OpenCV.Point.create(-1, -1)),
        1,
        BorderTypes.BORDER_CONSTANT,
        pool.add(OpenCV.Scalar.create(0)),
      );
      best = tryPass('edges' + size, closedEdges);
      if (best) break;
    }

    if (!best) {
      const binary = emptyMat(pool);
      const closedBinary = emptyMat(pool);
      OpenCV.threshold(
        blurred,
        binary,
        0,
        255,
        ThresholdTypes.THRESH_BINARY | ThresholdTypes.THRESH_OTSU,
      );
      OpenCV.morphologyEx(
        binary,
        closedBinary,
        MorphTypes.MORPH_CLOSE,
        rectKernel(pool, OTSU_CLOSE_KERNEL),
      );
      best = tryPass('otsu', closedBinary);
    }

    if (__DEV__) {
      console.log('[detectQuad]', {
        passes,
        candidates,
        chosenArea: best ? Math.round(best.area) : null,
        imageArea: width * height,
        quad: best?.quad ?? null,
      });
    }
    return best ? best.quad : null;
  } finally {
    pool.releaseAll();
  }
}

const rectKernel = (pool: Pool, size: number): Mat =>
  pool.add(
    OpenCV.getStructuringElement(MorphShapes.MORPH_RECT, pool.add(OpenCV.Size.create(size, size))),
  );

/**
 * All 4-vertex approximations of the contours in a binary image that are long enough to
 * enclose 20 % of it (a quad of area A has perimeter ≥ 4·√A), in contour vertex order.
 */
function quadCandidates(pool: Pool, binary: Mat, width: number, height: number): Point[][] {
  const contours = pool.add(OpenCV.PointVectorOfVectors.create());
  OpenCV.findContours(
    binary,
    contours,
    RetrievalModes.RETR_LIST,
    ContourApproximationModes.CHAIN_APPROX_SIMPLE,
  );
  const minPerimeter = 4 * Math.sqrt(MIN_AREA_RATIO * width * height);
  const result: Point[][] = [];
  for (let i = 0; i < contours.length; i++) {
    const contour = pool.add(contours.get(i));
    const perimeter = OpenCV.arcLength(contour, true).value;
    if (perimeter < minPerimeter) continue;
    for (const epsilon of APPROX_EPSILONS) {
      const approx = pool.add(OpenCV.PointVector.create());
      OpenCV.approxPolyDP(contour, approx, epsilon * perimeter, true);
      if (approx.length !== 4) continue;
      result.push(
        approx.getAll().map((p) => {
          pool.add(p);
          return { x: p.x, y: p.y };
        }),
      );
    }
  }
  return result;
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
