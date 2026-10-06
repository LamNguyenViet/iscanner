import { classifyIncoming } from '../../src/share/classify';
import { makeJpeg, makePng } from '../fixtures/images';

const pdfBytes = (): Uint8Array => new TextEncoder().encode('%PDF-1.7\n%...');

describe('classifyIncoming', () => {
  it('detects pdf', () => expect(classifyIncoming(pdfBytes())).toBe('pdf'));
  it('detects jpeg', () => expect(classifyIncoming(makeJpeg(4, 4))).toBe('image'));
  it('detects png', () => expect(classifyIncoming(makePng(4, 4))).toBe('image'));
  it('rejects unknown bytes', () =>
    expect(classifyIncoming(new Uint8Array([1, 2, 3, 4]))).toBe('unsupported'));
  it('rejects empty', () => expect(classifyIncoming(new Uint8Array(0))).toBe('unsupported'));
  it('classifies by bytes not name', () => {
    const file = { name: 'photo.jpg', bytes: pdfBytes() };
    expect(classifyIncoming(file.bytes)).toBe('pdf');
  });
});
