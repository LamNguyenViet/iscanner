import {
  clearPending, hasPendingImages, setPending, takeImages, takePdfs,
} from '../../src/share/incomingStore';
import type { IncomingFile } from '../../src/share/types';

const f = (n: string, kind: 'pdf' | 'image'): IncomingFile => ({ uri: `file:///${n}`, name: n, kind, size: 1 });

beforeEach(() => { clearPending(); });

describe('incomingStore', () => {
  it('takePdfs returns then clears', () => {
    setPending({ pdfs: [f('a.pdf', 'pdf')], images: [] });
    expect(takePdfs()).toEqual([f('a.pdf', 'pdf')]);
    expect(takePdfs()).toEqual([]);
  });
  it('hasPendingImages until takeImages', () => {
    setPending({ pdfs: [], images: [f('a.jpg', 'image')] });
    expect(hasPendingImages()).toBe(true);
    expect(takeImages()).toEqual([f('a.jpg', 'image')]);
    expect(hasPendingImages()).toBe(false);
  });
  it('setPending replaces and returns dropped files', () => {
    expect(setPending({ pdfs: [f('a.pdf', 'pdf')], images: [f('a.jpg', 'image')] })).toEqual([]);
    const dropped = setPending({ pdfs: [f('b.pdf', 'pdf')], images: [] });
    expect(dropped).toEqual([f('a.pdf', 'pdf'), f('a.jpg', 'image')]);
    expect(takePdfs()).toEqual([f('b.pdf', 'pdf')]);
  });
  it('clearPending returns and empties', () => {
    setPending({ pdfs: [f('a.pdf', 'pdf')], images: [f('a.jpg', 'image')] });
    expect(clearPending()).toEqual([f('a.pdf', 'pdf'), f('a.jpg', 'image')]);
    expect(takePdfs()).toEqual([]);
    expect(hasPendingImages()).toBe(false);
  });
});
