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

  describe('bypass hardening', () => {
    const b64 = 'QUJD'.repeat(750);
    const urlSafe = 'ab-_'.repeat(100);
    const leaks = (v: unknown) => /[A-Za-z0-9+/_-]{200,}/.test(JSON.stringify(redact(v)));

    it('redacts base64 embedded in longer strings', () => {
      expect(redact('x: ' + b64)).toBe('x: [base64 3000 chars]');
      expect(redact('a, ' + b64 + ', b')).toBe('a, [base64 3000 chars], b');
    });
    it('redacts URL-safe base64', () => {
      expect(redact(urlSafe)).toBe('[base64 400 chars]');
      expect(leaks('k=' + urlSafe)).toBe(false);
    });
    it('redacts whitespace-wrapped base64', () => {
      const wrapped = (b64.match(/.{1,76}/g) as string[]).join('\r\n');
      expect(redact(wrapped)).toBe(`[base64 ${wrapped.length} chars]`);
      const spaced = (b64.match(/.{1,64}/g) as string[]).join(' ');
      expect(redact(spaced)).toBe(`[base64 ${spaced.length} chars]`);
    });
    it('redacts data URIs regardless of case, position and wrapping', () => {
      expect(redact('DATA:image/png;base64,' + b64)).toBe('[data-uri image/png, 3022 chars]');
      expect(redact('  data:image/png;base64,AAAA')).toBe('  [data-uri image/png, 26 chars]');
      expect(redact('url(data:image/png;base64,' + b64 + ')')).toBe('url([data-uri image/png, 3022 chars])');
      expect(redact('a data:text/plain;base64,QQ== and data:image/gif;base64,R0lG b'))
        .toBe('a [data-uri text/plain, 27 chars] and [data-uri image/gif, 26 chars] b');
    });
    it('redacts and caps object keys', () => {
      expect(redact({ [b64]: true })).toEqual({ '[base64 3000 chars]': true });
      const key = redact({ ['k '.repeat(300)]: 1 }) as Record<string, number>;
      expect(Object.keys(key)[0].length).toBeLessThan(260);
      const big: Record<string, number> = {};
      for (let i = 0; i < 1000; i++) big['k' + i] = i;
      const out = redact(big) as Record<string, unknown>;
      expect(Object.keys(out)).toHaveLength(51);
      expect(out['[+950 keys]']).toBe(true);
    });
    it('redacts DataView and Buffer', () => {
      expect(redact(new DataView(new ArrayBuffer(16)))).toBe('[binary 16 bytes]');
      expect(redact(Buffer.from('hello'))).toBe('[binary 5 bytes]');
    });
    it('redacts base64 inside error message and stack', () => {
      const e = new Error('bad ' + b64);
      e.stack = 'Error: bad\n    at ' + b64;
      expect(JSON.stringify(redact(e))).not.toMatch(/[A-Za-z0-9+/=]{200,}/);
    });
    it('has no quadratic data-uri scanning', () => {
      const t0 = Date.now();
      redact('data:' + 'a'.repeat(200000));
      redact('data:;'.repeat(30000));
      expect(Date.now() - t0).toBeLessThan(100);
    });
    it('does not mangle normal content', () => {
      const normal = {
        uri: 'file:///data/user/0/com.iscanner/files/logs/2026-10-07.log',
        stack: 'Error: boom\n    at foo (src/a.ts:10:5)\n    at bar (node_modules/x/index.js:2:1)',
        vi: 'Không thể tải tệp PDF này. Vui lòng thử lại sau.',
        en: 'metadata: this is a normal english sentence with several words in it',
      };
      expect(redact(normal)).toEqual(normal);
      const longText = 'the quick brown fox jumps over the lazy dog '.repeat(10);
      expect(redact(longText)).toBe(longText);
    });
  });
});
