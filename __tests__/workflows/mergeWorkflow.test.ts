import { PDFDocument } from 'pdf-lib';
import { createMergedDocument, loadPickedPdfs } from '../../src/workflows/mergeWorkflow';
import type { DocumentMeta } from '../../src/library/types';

const meta = { id: '1' } as DocumentMeta;

async function makePdf(pages: number): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage([100 + i, 100]);
  return d.save();
}

describe('merge workflows', () => {
  let files: Record<string, Uint8Array>;
  const readBytes = async (uri: string) => {
    if (!(uri in files)) throw new Error('missing');
    return files[uri];
  };

  beforeAll(async () => {
    files = {
      a: await makePdf(1),
      b: await makePdf(2),
      bad: new Uint8Array([1, 2, 3, 4]),
    };
  });

  it('loads and reports failures', async () => {
    const res = await loadPickedPdfs({ readBytes }, [
      { uri: 'a', name: 'good.pdf' },
      { uri: 'bad', name: 'bad.pdf' },
      { uri: 'nope', name: 'unreadable.pdf' },
    ]);
    expect(res.loaded).toEqual([{ uri: 'a', name: 'good.pdf', pageCount: 1 }]);
    expect(res.failed).toEqual(['bad.pdf', 'unreadable.pdf']);
  });

  it('merge sums pages and orders', async () => {
    const add = jest.fn().mockResolvedValue(meta);
    await createMergedDocument(
      { readBytes, library: { add } },
      [
        { uri: 'b', name: 'b.pdf', pageCount: 2 },
        { uri: 'a', name: 'a.pdf', pageCount: 1 },
      ],
      'M',
    );
    expect(add).toHaveBeenCalledWith(expect.any(Uint8Array), {
      name: 'M',
      pageCount: 3,
      source: 'merge',
    });
    const doc = await PDFDocument.load(add.mock.calls[0][0]);
    expect(doc.getPages().map((p) => Math.round(p.getWidth()))).toEqual([100, 101, 100]);
  });

  it('merges duplicates', async () => {
    const add = jest.fn().mockResolvedValue(meta);
    const f = { uri: 'b', name: 'b.pdf', pageCount: 2 };
    await createMergedDocument({ readBytes, library: { add } }, [f, f], 'M');
    expect(add.mock.calls[0][1].pageCount).toBe(4);
    expect((await PDFDocument.load(add.mock.calls[0][0])).getPageCount()).toBe(4);
  });

  it('merge failure leaves library untouched', async () => {
    const add = jest.fn();
    await expect(
      createMergedDocument(
        { readBytes, library: { add } },
        [{ uri: 'nope', name: 'x.pdf', pageCount: 1 }],
        'M',
      ),
    ).rejects.toThrow();
    expect(add).not.toHaveBeenCalled();
  });
});
