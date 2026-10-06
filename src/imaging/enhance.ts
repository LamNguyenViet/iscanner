import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import { detectQuad, renderPage, type ImageSize, type Rotation } from '../native/opencv';
import {
  clampQuad,
  fitLongEdge,
  fullQuad,
  isQuadUsable,
  scaleQuad,
  type Quad,
} from './geometry';

export type { ImageSize, Rotation };

export const MAX_EDGE = 1920;
export const JPEG_QUALITY = 0.95;
const DETECT_EDGE = 800;

/** Scales so the long edge is at most 1920 px; never upscales. */
export function targetSize(size: ImageSize): ImageSize {
  return fitLongEdge(size, MAX_EDGE);
}

const decode = (source: string | ImageRef): Promise<ImageRef> =>
  ImageManipulator.manipulate(source).renderAsync();

async function resizeTo(image: ImageRef, size: ImageSize): Promise<ImageRef> {
  if (size.width === image.width && size.height === image.height) return image;
  return ImageManipulator.manipulate(image).resize(size).renderAsync();
}

let outputCounter = 0;

/**
 * Runs the single OpenCV pass (ruling R12, see `renderPage`) on `uri` and writes the result to
 * a new JPEG (quality 0.95, long edge ≤ 1920) under the cache directory; returns its uri. The
 * input file is kept. A partially written output is removed when the pass fails.
 */
async function render(
  uri: string,
  edit: { quad: Quad | null; rotation: Rotation },
): Promise<{ uri: string; input: ImageSize; output: ImageSize }> {
  outputCounter += 1;
  const out = new File(Paths.cache, `page-${Date.now()}-${outputCounter}.jpg`);
  const base64 = await new File(uri).base64();
  try {
    const sizes = renderPage(base64, {
      ...edit,
      maxEdge: MAX_EDGE,
      outPath: out.uri,
      quality: JPEG_QUALITY,
    });
    return { uri: out.uri, ...sizes };
  } catch (e) {
    try {
      if (out.exists) out.delete();
    } catch {
      // best-effort cleanup
    }
    throw e;
  }
}

/** Sharpens the whole image and normalizes it (long edge ≤ 1920, JPEG 0.95). Input is kept. */
export async function normalizePage(uri: string): Promise<string> {
  const result = await render(uri, { quad: null, rotation: 0 });
  if (__DEV__) {
    console.log('[normalizePage]', { input: result.input, output: result.output });
  }
  return result.uri;
}

/** Crops to `quad` (perspective-corrected), rotates clockwise, sharpens and normalizes. */
export async function applyEdit(
  uri: string,
  edit: { quad: Quad; rotation: Rotation },
): Promise<string> {
  return (await render(uri, edit)).uri;
}

/**
 * Detects the document corners on a copy with long edge 800 px and returns them in the
 * original image's pixel coordinates. Detection is best-effort: when nothing is found or it
 * fails, the full image is returned. Only a failure to decode the original propagates.
 */
export async function detectPageQuad(
  uri: string,
): Promise<{ quad: Quad; size: ImageSize; detected: boolean }> {
  const image = await decode(uri);
  const size = { width: image.width, height: image.height };
  const fallback = { quad: fullQuad(size.width, size.height), size, detected: false };
  try {
    const found = await detectOnSmallCopy(image, fitLongEdge(size, DETECT_EDGE));
    if (!found) return fallback;
    const quad = clampQuad(scaleQuad(found.quad, size.width / found.width), size.width, size.height);
    // A degenerate detection (coinciding corners, concave, sliver) is no detection at all.
    if (!isQuadUsable(quad, size.width, size.height)) return fallback;
    return { quad, size, detected: true };
  } catch {
    return fallback;
  }
}

async function detectOnSmallCopy(
  image: ImageRef,
  small: ImageSize,
): Promise<{ quad: Quad; width: number } | null> {
  const copy = await (await resizeTo(image, small)).saveAsync({
    base64: true,
    compress: JPEG_QUALITY,
    format: SaveFormat.JPEG,
  });
  try {
    const quad = copy.base64 ? detectQuad(copy.base64, small.width, small.height) : null;
    return quad ? { quad, width: small.width } : null;
  } finally {
    try {
      new File(copy.uri).delete();
    } catch {
      // best-effort cleanup
    }
  }
}
