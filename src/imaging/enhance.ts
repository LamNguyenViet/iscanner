import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import { detectQuad, warpAndSharpen, type Rotation } from '../native/opencv';
import { clampQuad, fullQuad, scaleQuad, type Quad } from './geometry';

export type { Rotation };

export const MAX_EDGE = 1920;
export const JPEG_QUALITY = 0.95;
const DETECT_EDGE = 800;

export type ImageSize = { width: number; height: number };

function fitLongEdge(size: ImageSize, maxEdge: number): ImageSize {
  const scale = Math.min(1, maxEdge / Math.max(size.width, size.height));
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
}

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

let tempCounter = 0;

/**
 * Writes the OpenCV output to a temp cache file, downscales it to Full HD if larger,
 * saves it as JPEG 0.95 and returns the new file's uri. The temp file is always deleted.
 */
async function saveNormalized(base64: string): Promise<string> {
  tempCounter += 1;
  const temp = new File(Paths.cache, `enhance-${Date.now()}-${tempCounter}.jpg`);
  try {
    temp.create({ overwrite: true });
    temp.write(base64, { encoding: 'base64' });
    const image = await decode(temp.uri);
    const resized = await resizeTo(image, targetSize(image));
    const saved = await resized.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
    return saved.uri;
  } finally {
    try {
      temp.delete();
    } catch {
      // best-effort cleanup
    }
  }
}

/** Sharpens the whole image and normalizes it (long edge ≤ 1920, JPEG 0.95). Input is kept. */
export async function normalizePage(uri: string): Promise<string> {
  const [image, base64] = await Promise.all([decode(uri), new File(uri).base64()]);
  return saveNormalized(warpAndSharpen(base64, fullQuad(image.width, image.height), 0));
}

/** Crops to `quad` (perspective-corrected), rotates clockwise, sharpens and normalizes. */
export async function applyEdit(
  uri: string,
  edit: { quad: Quad; rotation: Rotation },
): Promise<string> {
  const base64 = await new File(uri).base64();
  return saveNormalized(warpAndSharpen(base64, edit.quad, edit.rotation));
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
