import { PDFDocument } from 'pdf-lib';
import { createScanDocument } from '../../src/workflows/scanWorkflow';
import { makeJpeg, makePng } from '../fixtures/images';
import type { DocumentMeta } from '../../src/library/types';

const meta = { id: '1' } as DocumentMeta;

describe('createScanDocument', () => {
  const files: Record<string, Uint8Array> = {
    u1: makePng(10, 10),
    u2: makeJpeg(20, 20),
  };
  const readBytes = async (uri: string) => files[uri];

  it('builds pdf in given order', async () => {
    const add = jest.fn().mockResolvedValue(meta);
    const result = await createScanDocument({ readBytes, library: { add } }, ['u2', 'u1'], 'Doc');
    expect(result).toBe(meta);
    expect(add).toHaveBeenCalledWith(expect.any(Uint8Array), {
      name: 'Doc',
      pageCount: 2,
      source: 'scan',
    });
    const doc = await PDFDocument.load(add.mock.calls[0][0]);
    expect(doc.getPages().map((p) => Math.round(p.getWidth()))).toEqual([20, 10]);
  });

  it('rejects empty', async () => {
    const add = jest.fn();
    await expect(createScanDocument({ readBytes, library: { add } }, [], 'Doc')).rejects.toThrow(
      'NO_IMAGES',
    );
    expect(add).not.toHaveBeenCalled();
  });
});
