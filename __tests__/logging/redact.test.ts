import { redact } from '../../src/logging/redact';
import { formatRecord } from '../../src/logging/format';

describe('redact', () => {
  it('replaces typed arrays and ArrayBuffer', () => {
    expect(redact(new Uint8Array(1024))).toBe('[binary 1024 bytes]');
    expect(redact(new ArrayBuffer(8))).toBe('[binary 8 bytes]');
  });
  it('replaces data URIs', () => {
    const s = 'data:image/jpeg;base64,' + 'A'.repeat(500);
    expect(redact(s)).toBe('[data-uri image/jpeg, 523 chars]');
    expect(redact('data:;base64,AAAA')).toBe('[data-uri unknown, 17 chars]');
  });
  it('replaces long base64 strings only from 200 chars', () => {
    expect(redact('QUJD'.repeat(750))).toBe('[base64 3000 chars]');
    const short = 'A'.repeat(199);
    expect(redact(short)).toBe(short);
  });
  it('truncates long plain strings', () => {
    const s = 'hello world. '.repeat(200).slice(0, 2500);
    expect(redact(s)).toBe(s.slice(0, 2000) + '…[+500 chars]');
  });
  it('caps depth at 5', () => {
    const v = { a: { a: { a: { a: { a: { a: { a: 'x' } } } } } } };
    const out = redact(v) as any;
    expect(out.a.a.a.a.a).toEqual({ a: '[depth]' });
  });
  it('caps arrays at 50 items', () => {
    const out = redact(Array.from({ length: 60 }, (_, i) => i)) as unknown[];
    expect(out).toHaveLength(51);
    expect(out[49]).toBe(49);
    expect(out[50]).toBe('[+10 items]');
  });
  it('marks circular references', () => {
    const o: any = { n: 1 };
    o.self = o;
    expect(redact(o)).toEqual({ n: 1, self: '[circular]' });
  });
  it('drops functions and symbols', () => {
    expect(redact({ f: () => 1, s: Symbol('x'), k: 1 })).toEqual({ k: 1 });
    expect(redact([1, () => 1, 2])).toEqual([1, 2]);
  });
  it('serializes Error with cause', () => {
    const out = redact(new Error('boom', { cause: new Error('inner') })) as any;
    expect(out.name).toBe('Error');
    expect(out.message).toBe('boom');
    expect(typeof out.stack).toBe('string');
    expect(out.cause.message).toBe('inner');
  });
  it('leaves no base64 or data URIs in a formatted record', () => {
    const b64 = 'iVBO'.repeat(750);
    const err = new Error('x', { cause: 'iVBOR'.repeat(400) });
    const line = formatRecord({
      t: 'now', lvl: 'error', cause: err,
      data: {
        img: new Uint8Array(4096),
        nested: { uri: 'data:image/png;base64,' + b64, list: [b64, b64, b64] },
      },
    });
    expect(line).not.toMatch(/[A-Za-z0-9+/=]{200,}/);
    expect(line).not.toContain('data:image');
  });
});
