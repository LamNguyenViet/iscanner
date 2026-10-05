import { PNG } from 'pngjs';
import { encode } from 'jpeg-js';

export function makePng(w: number, h: number): Uint8Array {
  const png = new PNG({ width: w, height: h });
  png.data.fill(200);
  return new Uint8Array(PNG.sync.write(png));
}

export function makeJpeg(w: number, h: number): Uint8Array {
  const data = Buffer.alloc(w * h * 4, 200);
  return new Uint8Array(encode({ data, width: w, height: h }, 80).data);
}
