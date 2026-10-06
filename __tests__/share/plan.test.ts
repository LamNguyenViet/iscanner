import { planIncoming } from '../../src/share/plan';
import type { IncomingFile } from '../../src/share/types';

const pdf = (n: string): IncomingFile => ({ uri: `file:///${n}.pdf`, name: `${n}.pdf`, kind: 'pdf', size: 1 });
const img = (n: string): IncomingFile => ({ uri: `file:///${n}.jpg`, name: `${n}.jpg`, kind: 'image', size: 1 });

describe('planIncoming', () => {
  it('none for empty', () => expect(planIncoming([])).toEqual({ kind: 'none' }));
  it('single pdf', () =>
    expect(planIncoming([pdf('a')])).toEqual({ kind: 'single-pdf', pdf: pdf('a'), images: [] }));
  it('two pdfs merge', () =>
    expect(planIncoming([pdf('a'), pdf('b')])).toEqual({ kind: 'merge', pdfs: [pdf('a'), pdf('b')], images: [] }));
  it('images scan', () =>
    expect(planIncoming([img('a'), img('b')])).toEqual({ kind: 'scan', images: [img('a'), img('b')] }));
  it('pdf + images is single-pdf with images', () =>
    expect(planIncoming([img('a'), pdf('p'), img('b')])).toEqual({
      kind: 'single-pdf', pdf: pdf('p'), images: [img('a'), img('b')],
    }));
  it('2 pdfs + image merge with images', () =>
    expect(planIncoming([pdf('a'), img('i'), pdf('b')])).toEqual({
      kind: 'merge', pdfs: [pdf('a'), pdf('b')], images: [img('i')],
    }));
});
