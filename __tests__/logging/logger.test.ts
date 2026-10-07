import { createMemoryFs } from '../../src/library/memoryFs';
import { createLogger } from '../../src/logging/logger';

const D1 = new Date(2026, 9, 7, 19, 35, 12, 481);
const D2 = new Date(2026, 9, 8, 0, 5, 0, 0);
const F1 = 'logs/2026-10-07.log';
const F2 = 'logs/2026-10-08.log';

function setup(opts: { dev?: boolean } = {}) {
  const fs = createMemoryFs();
  let current = D1;
  const cons = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const logger = createLogger({ fs, now: () => current, console: cons, dev: opts.dev });
  return { fs, logger, cons, setNow: (d: Date) => (current = d) };
}

const lines = (fs: ReturnType<typeof createMemoryFs>, path: string) =>
  ((fs.files.get(path) as string | undefined) ?? '').split('\n').filter(Boolean).map((l) => JSON.parse(l));

describe('logger', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('buffers info until 2 s pass', async () => {
    const { fs, logger } = setup();
    logger.info('scan.cancelled');
    await jest.advanceTimersByTimeAsync(1999);
    expect(fs.files.has(F1)).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    const recs = lines(fs, F1);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ lvl: 'info', event: 'scan.cancelled' });
  });

  it('writes error immediately with app/os after init', async () => {
    const { fs, logger } = setup();
    await logger.init({ app: '1.6.0', os: 'android 34' });
    logger.error('E_X', 'boom', { file: 'a.pdf', cause: new Error('why') });
    await logger.flush();
    const [rec] = lines(fs, F1);
    expect(rec).toMatchObject({ lvl: 'error', code: 'E_X', msg: 'boom', file: 'a.pdf', app: '1.6.0', os: 'android 34' });
    expect(rec.cause.message).toBe('why');
  });

  it('does not attach app/os to info or warn', async () => {
    const { fs, logger } = setup();
    await logger.init({ app: '1.6.0', os: 'android 34' });
    logger.info('x');
    logger.warn('y');
    await logger.flush();
    for (const r of lines(fs, F1)) expect(r.app).toBeUndefined();
  });

  it('writes two records of one flush as one append, in order', async () => {
    const { fs, logger } = setup();
    const spy = jest.spyOn(fs, 'append');
    logger.info('a');
    logger.warn('b');
    await logger.flush();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(lines(fs, F1).map((r) => r.event ?? r.msg)).toEqual(['a', 'b']);
  });

  it('writes to the next day file after the date changes', async () => {
    const { fs, logger, setNow } = setup();
    logger.info('day1');
    await logger.flush();
    setNow(D2);
    logger.info('day2');
    await logger.flush();
    expect(lines(fs, F1).map((r) => r.event)).toEqual(['day1']);
    expect(lines(fs, F2).map((r) => r.event)).toEqual(['day2']);
  });

  it('caps the buffer at 500 and records an overflow warn', async () => {
    const { fs, logger } = setup();
    for (let i = 0; i < 520; i++) logger.info('e', { i });
    await logger.flush();
    const recs = lines(fs, F1);
    expect(recs).toHaveLength(501);
    const overflow = recs.filter((r) => r.msg === 'log buffer overflow');
    expect(overflow).toHaveLength(1);
    expect(overflow[0]).toMatchObject({ lvl: 'warn', data: { dropped: 20 } });
    expect(recs.filter((r) => r.event === 'e')[0].data.i).toBe(20);
  });

  it('daily cap: counts the existing file size; drops info, keeps warn/error', async () => {
    const { fs, logger } = setup();
    fs.files.set(F1, 'x'.repeat(2 * 1024 * 1024));
    logger.info('dropped');
    logger.warn('kept-warn');
    await logger.flush();
    logger.error('E', 'kept-error');
    await logger.flush();
    const text = fs.files.get(F1) as string;
    expect(text).not.toContain('"dropped"');
    expect(text).toContain('kept-warn');
    expect(text).toContain('kept-error');
  });

  it('init deletes expired files and keeps the rest', async () => {
    const { fs, logger } = setup();
    fs.files.set('logs/2026-09-30.log', 'old');
    fs.files.set('logs/2026-10-01.log', 'keep');
    fs.files.set('logs/notes.txt', 'keep');
    await logger.init({ app: 'a', os: 'o' });
    expect(fs.files.has('logs/2026-09-30.log')).toBe(false);
    expect(fs.files.has('logs/2026-10-01.log')).toBe(true);
    expect(fs.files.has('logs/notes.txt')).toBe(true);
  });

  it('survives an append failure and writes the next record later', async () => {
    const { fs, logger } = setup();
    fs.failNextAppend(F1);
    logger.error('E1', 'lost');
    await expect(logger.flush()).resolves.toBeUndefined();
    logger.error('E2', 'later');
    await logger.flush();
    const recs = lines(fs, F1);
    expect(recs.map((r) => r.code)).toEqual(['E2']);
  });

  it('survives list throwing during init', async () => {
    const { fs, logger } = setup();
    jest.spyOn(fs, 'list').mockRejectedValue(new Error('nope'));
    await expect(logger.init({ app: 'a', os: 'o' })).resolves.toBeUndefined();
  });

  it('debug is never written; console only in dev', async () => {
    const off = setup({ dev: false });
    off.logger.debug('d');
    await off.logger.flush();
    expect(off.fs.files.size).toBe(0);
    expect(off.cons.log).not.toHaveBeenCalled();

    const on = setup({ dev: true });
    on.logger.debug('d');
    await on.logger.flush();
    expect(on.fs.files.size).toBe(0);
    expect(on.cons.log).toHaveBeenCalled();
  });

  it('never writes base64, data URIs or binary content', async () => {
    const { fs, logger } = setup();
    const b64 = Buffer.from(new Uint8Array(2300).map((_, i) => i % 251)).toString('base64');
    expect(b64.length).toBeGreaterThan(3000);
    const cause = Object.assign(new Error('bad image'), {
      bytes: new Uint8Array(5000),
      payload: b64,
      uri: `data:image/png;base64,${b64}`,
    });
    logger.error('E_IMG', `failed ${b64}`, { cause, data: { raw: b64 } });
    await logger.flush();
    const text = fs.files.get(F1) as string;
    expect(text).not.toMatch(/[A-Za-z0-9+/=]{200,}/);
    expect(text).not.toContain('data:');
    expect(text).toContain('bad image');
  });
});
