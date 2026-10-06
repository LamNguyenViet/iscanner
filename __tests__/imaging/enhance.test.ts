import {
  applyEdit,
  detectPageQuad,
  JPEG_QUALITY,
  MAX_EDGE,
  normalizePage,
  targetSize,
} from '../../src/imaging/enhance';
import { fullQuad, type Quad } from '../../src/imaging/geometry';
import { detectQuad, warpAndSharpen } from '../../src/native/opencv';

jest.mock('../../src/native/opencv', () => ({
  detectQuad: jest.fn(),
  warpAndSharpen: jest.fn(),
}));

// In-memory file system: uri -> base64 content.
const mockFiles = new Map<string, string>();
// Image "decoder": base64 content -> pixel size.
const mockImages = new Map<string, { width: number; height: number }>();
const mockResizes: { width?: number | null; height?: number | null }[] = [];
const mockSaves: { options: Record<string, unknown>; width: number; height: number }[] = [];

jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(parent: { uri: string } | string, name?: string) {
      const base = typeof parent === 'string' ? parent : parent.uri;
      this.uri = name ? `${base.replace(/\/$/, '')}/${name}` : base;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    async base64() {
      const content = mockFiles.get(this.uri);
      if (content === undefined) throw new Error(`ENOENT ${this.uri}`);
      return content;
    }
    create() {
      mockFiles.set(this.uri, '');
    }
    write(content: string, options?: { encoding?: string }) {
      if (options?.encoding !== 'base64') throw new Error('expected base64 write');
      mockFiles.set(this.uri, content);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  }
  return { File, Paths: { cache: { uri: 'file:///cache/' } } };
});

jest.mock('expo-image-manipulator', () => {
  let saveCount = 0;
  type MockRef = {
    width: number;
    height: number;
    content: string;
    saveAsync: (options: Record<string, unknown>) => Promise<unknown>;
  };
  const makeRef = (content: string, width: number, height: number): MockRef => ({
    width,
    height,
    content,
    async saveAsync(options) {
      saveCount += 1;
      const uri = `file:///manipulator/out-${saveCount}.jpg`;
      const saved = `${content}@${width}x${height}`;
      mockFiles.set(uri, saved);
      mockImages.set(saved, { width, height });
      mockSaves.push({ options, width, height });
      return { uri, width, height, base64: options.base64 ? saved : undefined };
    },
  });
  return {
    SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
    ImageManipulator: {
      manipulate(source: string | MockRef) {
        let content: string;
        let size: { width: number; height: number };
        if (typeof source === 'string') {
          const fileContent = mockFiles.get(source);
          if (fileContent === undefined) throw new Error(`ENOENT ${source}`);
          const known = mockImages.get(fileContent);
          if (!known) throw new Error(`not an image: ${fileContent}`);
          content = fileContent;
          size = known;
        } else {
          content = source.content;
          size = { width: source.width, height: source.height };
        }
        let resized: { width: number; height: number } | null = null;
        const context = {
          resize(target: { width?: number | null; height?: number | null }) {
            mockResizes.push(target);
            const scale = target.width ? target.width / size.width : target.height! / size.height;
            resized = {
              width: target.width ?? Math.round(size.width * scale),
              height: target.height ?? Math.round(size.height * scale),
            };
            return context;
          },
          async renderAsync() {
            const out = resized ?? size;
            return makeRef(content, out.width, out.height);
          },
        };
        return context;
      },
    },
  };
});

const mockedWarp = warpAndSharpen as jest.Mock;
const mockedDetect = detectQuad as jest.Mock;

const INPUT = 'file:///scans/page.jpg';

function givenInput(width: number, height: number) {
  mockFiles.set(INPUT, 'orig');
  mockImages.set('orig', { width, height });
}

function givenWarpOutput(width: number, height: number) {
  mockImages.set('sharp', { width, height });
  mockedWarp.mockReturnValue('sharp');
}

const cacheFiles = () => [...mockFiles.keys()].filter((uri) => uri.startsWith('file:///cache/'));

beforeEach(() => {
  mockFiles.clear();
  mockImages.clear();
  mockResizes.length = 0;
  mockSaves.length = 0;
  mockedWarp.mockReset();
  mockedDetect.mockReset();
});

describe('constants', () => {
  it('uses Full HD long edge and JPEG 95', () => {
    expect(MAX_EDGE).toBe(1920);
    expect(JPEG_QUALITY).toBe(0.95);
  });
});

describe('targetSize', () => {
  it('downscales landscape to long edge 1920', () => {
    expect(targetSize({ width: 4000, height: 3000 })).toEqual({ width: 1920, height: 1440 });
  });

  it('downscales portrait to long edge 1920', () => {
    expect(targetSize({ width: 3000, height: 4000 })).toEqual({ width: 1440, height: 1920 });
  });

  it('keeps smaller images unchanged', () => {
    expect(targetSize({ width: 1280, height: 960 })).toEqual({ width: 1280, height: 960 });
  });

  it('keeps exactly Full HD unchanged', () => {
    expect(targetSize({ width: 1920, height: 1080 })).toEqual({ width: 1920, height: 1080 });
  });
});

describe('normalizePage', () => {
  it('downsizes large images and saves JPEG 0.95 to a new uri', async () => {
    givenInput(4000, 3000);
    givenWarpOutput(4000, 3000);

    const out = await normalizePage(INPUT);

    expect(out).not.toBe(INPUT);
    expect(mockResizes).toEqual([{ width: 1920, height: 1440 }]);
    expect(mockSaves.at(-1)).toEqual({
      options: { compress: 0.95, format: 'jpeg' },
      width: 1920,
      height: 1440,
    });
    expect(mockFiles.get(out)).toBe('sharp@1920x1440');
  });

  it('keeps small images size but still saves at 0.95', async () => {
    givenInput(1280, 960);
    givenWarpOutput(1280, 960);

    const out = await normalizePage(INPUT);

    expect(mockResizes).toEqual([]);
    expect(mockSaves.at(-1)).toEqual({
      options: { compress: 0.95, format: 'jpeg' },
      width: 1280,
      height: 960,
    });
    expect(mockFiles.get(out)).toBe('sharp@1280x960');
  });

  it('sharpens with the full quad and no rotation', async () => {
    givenInput(4000, 3000);
    givenWarpOutput(4000, 3000);

    await normalizePage(INPUT);

    expect(mockedWarp).toHaveBeenCalledWith('orig', fullQuad(4000, 3000), 0);
  });

  it('deletes its temp file and keeps the input', async () => {
    givenInput(4000, 3000);
    givenWarpOutput(4000, 3000);

    await normalizePage(INPUT);

    expect(cacheFiles()).toEqual([]);
    expect(mockFiles.get(INPUT)).toBe('orig');
  });
});

describe('applyEdit', () => {
  const quad: Quad = [
    { x: 100, y: 120 },
    { x: 2900, y: 80 },
    { x: 2950, y: 3900 },
    { x: 60, y: 3950 },
  ];

  it('passes quad and rotation to warpAndSharpen, then normalizes', async () => {
    givenInput(3000, 4000);
    givenWarpOutput(2500, 1500);

    const out = await applyEdit(INPUT, { quad, rotation: 90 });

    expect(mockedWarp).toHaveBeenCalledWith('orig', quad, 90);
    expect(mockResizes).toEqual([{ width: 1920, height: 1152 }]);
    expect(mockSaves.at(-1)).toEqual({
      options: { compress: 0.95, format: 'jpeg' },
      width: 1920,
      height: 1152,
    });
    expect(out).not.toBe(INPUT);
    expect(cacheFiles()).toEqual([]);
  });
});

describe('detectPageQuad', () => {
  const smallQuad: Quad = [
    { x: 10, y: 20 },
    { x: 790, y: 15 },
    { x: 780, y: 590 },
    { x: 12, y: 580 },
  ];

  it('detects on an 800 px copy and scales the quad back', async () => {
    givenInput(4000, 3000);
    mockedDetect.mockReturnValue(smallQuad);

    const result = await detectPageQuad(INPUT);

    expect(mockResizes).toEqual([{ width: 800, height: 600 }]);
    expect(mockedDetect).toHaveBeenCalledWith('orig@800x600', 800, 600);
    expect(result).toEqual({
      quad: smallQuad.map((p) => ({ x: p.x * 5, y: p.y * 5 })),
      size: { width: 4000, height: 3000 },
      detected: true,
    });
  });

  it('falls back to the full image when nothing is detected', async () => {
    givenInput(4000, 3000);
    mockedDetect.mockReturnValue(null);

    const result = await detectPageQuad(INPUT);

    expect(result).toEqual({
      quad: fullQuad(4000, 3000),
      size: { width: 4000, height: 3000 },
      detected: false,
    });
  });

  it('falls back to the full image and removes the copy when detection throws', async () => {
    givenInput(4000, 3000);
    mockedDetect.mockImplementation(() => {
      throw new Error('cvtColor: bad channel count');
    });

    const result = await detectPageQuad(INPUT);

    expect(result).toEqual({
      quad: fullQuad(4000, 3000),
      size: { width: 4000, height: 3000 },
      detected: false,
    });
    expect([...mockFiles.keys()]).toEqual([INPUT]);
  });

  it('removes the detection copy', async () => {
    givenInput(4000, 3000);
    mockedDetect.mockReturnValue(null);

    await detectPageQuad(INPUT);

    expect([...mockFiles.keys()]).toEqual([INPUT]);
  });
});
