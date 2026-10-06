import { useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { clampQuad, type Point, type Quad } from '../imaging/geometry';
import type { Rotation } from '../imaging/enhance';

export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };

export const HANDLE = 44; // touch target (dp)
const HANDLE_HIT_SLOP = 8; // extra touch area around a handle (dp)
const MAGNIFIER = 96; // magnifier diameter (dp)
const ZOOM = 2;

/** Size of the image once rotated clockwise by `rotation`. */
export function rotatedSize(size: Size, rotation: Rotation): Size {
  return rotation === 90 || rotation === 270 ? { width: size.height, height: size.width } : size;
}

/** Largest rect with `content`'s aspect ratio that fits in `box`, centred. */
export function containRect(content: Size, box: Size): Rect {
  if (content.width <= 0 || content.height <= 0 || box.width <= 0 || box.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.min(box.width / content.width, box.height / content.height);
  const width = content.width * scale;
  const height = content.height * scale;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}

/**
 * Where the editor draws the image: the contain-fit of `content` inside `canvas` inset by
 * HANDLE/2 on every side, so handles on the image's edges and corners stay fully inside the
 * canvas (and touchable). Empty when the canvas is not measured yet or too small.
 */
export function editorImageRect(content: Size, canvas: Size): Rect {
  const inner = containRect(content, {
    width: canvas.width - HANDLE,
    height: canvas.height - HANDLE,
  });
  if (inner.width <= 0 || inner.height <= 0) return inner;
  return { ...inner, x: inner.x + HANDLE / 2, y: inner.y + HANDLE / 2 };
}

/**
 * Maps a point in un-rotated image pixels to screen coordinates, where `rect` is the on-screen
 * rect of the image displayed rotated clockwise by `rotation`.
 */
export function imageToScreen(p: Point, size: Size, rotation: Rotation, rect: Rect): Point {
  const { width: W, height: H } = size;
  const r =
    rotation === 90
      ? { x: H - p.y, y: p.x }
      : rotation === 180
        ? { x: W - p.x, y: H - p.y }
        : rotation === 270
          ? { x: p.y, y: W - p.x }
          : p;
  const rs = rotatedSize(size, rotation);
  return { x: rect.x + (r.x * rect.width) / rs.width, y: rect.y + (r.y * rect.height) / rs.height };
}

/** Inverse of imageToScreen. */
export function screenToImage(s: Point, size: Size, rotation: Rotation, rect: Rect): Point {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  const { width: W, height: H } = size;
  const rs = rotatedSize(size, rotation);
  const X = ((s.x - rect.x) * rs.width) / rect.width;
  const Y = ((s.y - rect.y) * rs.height) / rect.height;
  if (rotation === 90) return { x: Y, y: H - X };
  if (rotation === 180) return { x: W - X, y: H - Y };
  if (rotation === 270) return { x: W - Y, y: X };
  return { x: X, y: Y };
}

/** The image rotated clockwise by `rotation`, drawn at `scale` with its rotated box at left/top. */
export function RotatedImage({
  uri,
  size,
  rotation,
  scale,
  left,
  top,
  testID,
}: {
  uri: string;
  size: Size;
  rotation: Rotation;
  scale: number;
  left: number;
  top: number;
  testID?: string;
}) {
  const box = rotatedSize(size, rotation);
  const w = size.width * scale;
  const h = size.height * scale;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left, top, width: box.width * scale, height: box.height * scale }}
    >
      <Image
        testID={testID}
        source={{ uri }}
        resizeMode="stretch"
        style={{
          position: 'absolute',
          width: w,
          height: h,
          left: (box.width * scale - w) / 2,
          top: (box.height * scale - h) / 2,
          transform: [{ rotate: `${rotation}deg` }],
        }}
      />
    </View>
  );
}

type Props = {
  /** On-screen rect of the displayed (rotated) image, relative to this overlay. */
  imageRect: Rect;
  /** Un-rotated image size in pixels; the quad is in this space. */
  imageSize: Size;
  quad: Quad;
  onChange: (q: Quad) => void;
  rotation?: Rotation;
  /** When given, a magnifier shows the image under the active handle while dragging. */
  imageUri?: string;
};

/** Overlay with the crop outline and 4 draggable corner handles (corner-0..3 = TL, TR, BR, BL). */
export function CornerHandles({ imageRect, imageSize, quad, onChange, rotation = 0, imageUri }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const screen = quad.map((p) => imageToScreen(p, imageSize, rotation, imageRect));

  // Latest values for the gesture callbacks (gestures are created once per handle).
  const latest = useRef({ imageRect, imageSize, quad, onChange, rotation });
  latest.current = { imageRect, imageSize, quad, onChange, rotation };

  const activePoint = active === null ? null : screen[active];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {screen.map((p, i) => (
        <Line key={`l${i}`} a={p} b={screen[(i + 1) % 4]} />
      ))}
      {screen.map((p, i) => (
        <Handle
          key={`h${i}`}
          index={i}
          point={p}
          active={active === i}
          latest={latest}
          onActive={setActive}
        />
      ))}
      {activePoint && imageUri && (
        <Magnifier
          uri={imageUri}
          size={imageSize}
          rotation={rotation}
          rect={imageRect}
          point={activePoint}
        />
      )}
    </View>
  );
}

type Latest = {
  current: {
    imageRect: Rect;
    imageSize: Size;
    quad: Quad;
    onChange: (q: Quad) => void;
    rotation: Rotation;
  };
};

function Handle({
  index,
  point,
  active,
  latest,
  onActive,
}: {
  index: number;
  point: Point;
  active: boolean;
  latest: Latest;
  onActive: (i: number | null) => void;
}) {
  const start = useRef<Point>({ x: 0, y: 0 });
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .hitSlop(HANDLE_HIT_SLOP)
        .onBegin(() => {
          const { quad, imageSize, rotation, imageRect } = latest.current;
          start.current = imageToScreen(quad[index], imageSize, rotation, imageRect);
          onActive(index);
        })
        .onUpdate((e) => {
          const { quad, imageSize, rotation, imageRect, onChange } = latest.current;
          const target = screenToImage(
            { x: start.current.x + e.translationX, y: start.current.y + e.translationY },
            imageSize,
            rotation,
            imageRect,
          );
          const next = quad.map((p, i) => (i === index ? target : p)) as Quad;
          onChange(clampQuad(next, imageSize.width, imageSize.height));
        })
        .onFinalize(() => onActive(null)),
    [index, latest, onActive],
  );
  return (
    <GestureDetector gesture={gesture}>
      <View
        testID={`corner-${index}`}
        accessibilityLabel={`Góc ${index + 1}`}
        style={[styles.handle, { left: point.x - HANDLE / 2, top: point.y - HANDLE / 2 }]}
      >
        <View style={[styles.handleDot, active && styles.handleDotActive]} />
      </View>
    </GestureDetector>
  );
}

function Line({ a, b }: { a: Point; b: Point }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  return (
    <View
      pointerEvents="none"
      style={[
        styles.line,
        {
          left: (a.x + b.x) / 2 - length / 2,
          top: (a.y + b.y) / 2 - 1,
          width: length,
          transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
        },
      ]}
    />
  );
}

function Magnifier({
  uri,
  size,
  rotation,
  rect,
  point,
}: {
  uri: string;
  size: Size;
  rotation: Rotation;
  rect: Rect;
  point: Point;
}) {
  const box = rotatedSize(size, rotation);
  const scale = (rect.width / box.width) * ZOOM;
  const zx = (point.x - rect.x) * ZOOM;
  const zy = (point.y - rect.y) * ZOOM;
  // Keep the magnifier out from under the finger: top-left, or top-right when dragging there.
  const nearTopLeft = point.x < MAGNIFIER + 24 && point.y < MAGNIFIER + 24;
  return (
    <View
      testID="corner-magnifier"
      pointerEvents="none"
      style={[styles.magnifier, nearTopLeft ? { right: 8 } : { left: 8 }]}
    >
      <RotatedImage
        uri={uri}
        size={size}
        rotation={rotation}
        scale={scale}
        left={MAGNIFIER / 2 - zx}
        top={MAGNIFIER / 2 - zy}
      />
      <View style={styles.crosshair} />
    </View>
  );
}

const ACCENT = '#1a73e8';

const styles = StyleSheet.create({
  line: { position: 'absolute', height: 2, backgroundColor: ACCENT },
  handle: {
    position: 'absolute',
    width: HANDLE,
    height: HANDLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: ACCENT,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  handleDotActive: { backgroundColor: ACCENT },
  magnifier: {
    position: 'absolute',
    top: 8,
    width: MAGNIFIER,
    height: MAGNIFIER,
    borderRadius: MAGNIFIER / 2,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#000',
  },
  crosshair: {
    position: 'absolute',
    left: MAGNIFIER / 2 - 4,
    top: MAGNIFIER / 2 - 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: ACCENT,
  },
});
