import { formatRecord, localIsoTimestamp, logFileName, serializeError } from '../../src/logging/format';
import { AppError } from '../../src/errors/AppError';

describe('format', () => {
  it('localIsoTimestamp uses local wall clock and offset', () => {
    const d = new Date(2026, 9, 7, 19, 35, 12, 481);
    const s = localIsoTimestamp(d);
    expect(s).toMatch(/^2026-10-07T19:35:12\.481[+-]\d{2}:\d{2}$/);
    const m = /([+-])(\d{2}):(\d{2})$/.exec(s)!;
    const mins = (m[1] === '+' ? 1 : -1) * (Number(m[2]) * 60 + Number(m[3]));
    expect(mins).toBe(-d.getTimezoneOffset());
  });
  it('logFileName uses the local date', () => {
    expect(logFileName(new Date(2026, 9, 7, 23, 59))).toBe('2026-10-07.log');
    expect(logFileName(new Date(2026, 9, 8, 0, 0))).toBe('2026-10-08.log');
  });
  it('serializeError stops at cause depth 3 and limits stack to 20 lines', () => {
    let e: Error = new Error('e6');
    for (let i = 5; i >= 0; i--) e = new Error('e' + i, { cause: e });
    e.stack = Array.from({ length: 40 }, (_, i) => 'line' + i).join('\n');
    let o: any = serializeError(e);
    let causes = 0;
    while (o && typeof o === 'object' && 'cause' in o) { causes++; o = o.cause; }
    expect(causes).toBe(3);
    expect(((serializeError(e) as any).stack as string).split('\n')).toHaveLength(20);
  });
  it('serializeError includes code and fileName for AppError', () => {
    const o = serializeError(new AppError('PDF_LOAD', { fileName: 'a.pdf' })) as any;
    expect(o.code).toBe('PDF_LOAD');
    expect(o.fileName).toBe('a.pdf');
  });
  it('formatRecord ends with newline and parses', () => {
    const line = formatRecord({ t: 'x', lvl: 'info', msg: 'hi' });
    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line)).toEqual({ t: 'x', lvl: 'info', msg: 'hi' });
  });
  it('formatRecord never throws', () => {
    const data = { get bad(): string { throw new Error('nope'); } };
    const line = formatRecord({ t: 'x', lvl: 'warn', data });
    expect(JSON.parse(line)).toEqual({ t: 'x', lvl: 'warn', msg: '[unserializable]' });
  });
});
