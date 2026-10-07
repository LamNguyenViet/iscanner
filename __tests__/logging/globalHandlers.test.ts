import { createMemoryFs } from '../../src/library/memoryFs';
import { installGlobalHandlers } from '../../src/logging/globalHandlers';
import { createLogger } from '../../src/logging/logger';

const F1 = 'logs/2026-10-07.log';

function setup() {
  const fs = createMemoryFs();
  const logger = createLogger({ fs, now: () => new Date(2026, 9, 7, 12, 0, 0) });
  return { fs, logger };
}

function fakeErrorUtils(previous: jest.Mock) {
  let handler: (e: unknown, f?: boolean) => void = previous;
  return {
    getGlobalHandler: () => handler,
    setGlobalHandler: (h: (e: unknown, f?: boolean) => void) => {
      handler = h;
    },
    current: () => handler,
  };
}

describe('installGlobalHandlers', () => {
  it('logs fatal, flushes, then calls the previous handler', async () => {
    const { fs, logger } = setup();
    let fileAtCall: string | undefined;
    const previous = jest.fn(() => {
      fileAtCall = fs.files.get(F1) as string | undefined;
    });
    const errorUtils = fakeErrorUtils(previous);
    installGlobalHandlers(logger, { errorUtils, tracker: { enable: jest.fn() } });

    const err = new Error('boom');
    errorUtils.current()(err, true);
    await new Promise((r) => setTimeout(r, 0));

    expect(previous).toHaveBeenCalledWith(err, true);
    expect(fileAtCall).toContain('"lvl":"fatal"');
    expect(fileAtCall).toContain('boom');
  });

  it('calls the previous handler even if flush hangs (bounded)', async () => {
    jest.useFakeTimers();
    try {
      const previous = jest.fn();
      const errorUtils = fakeErrorUtils(previous);
      const hung = {
        ...createLogger({ fs: createMemoryFs() }),
        fatal: jest.fn(),
        flush: () => new Promise<void>(() => {}),
      };
      installGlobalHandlers(hung, { errorUtils, tracker: { enable: jest.fn() } });
      errorUtils.current()(new Error('x'), true);
      await jest.advanceTimersByTimeAsync(499);
      expect(previous).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(previous).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('uninstall restores the previous handler', () => {
    const { logger } = setup();
    const previous = jest.fn();
    const errorUtils = fakeErrorUtils(previous);
    const uninstall = installGlobalHandlers(logger, { errorUtils, tracker: { enable: jest.fn() } });
    expect(errorUtils.current()).not.toBe(previous);
    uninstall();
    expect(errorUtils.current()).toBe(previous);
  });

  it('logs unhandled rejections as UNHANDLED_REJECTION errors', async () => {
    const { fs, logger } = setup();
    let onUnhandled: (id: number, e: unknown) => void = () => {};
    const tracker = { enable: jest.fn((o) => { onUnhandled = o.onUnhandled; }) };
    installGlobalHandlers(logger, { errorUtils: fakeErrorUtils(jest.fn()), tracker });
    expect(tracker.enable).toHaveBeenCalled();
    onUnhandled(1, new Error('rejected!'));
    await logger.flush();
    const text = fs.files.get(F1) as string;
    expect(text).toContain('"code":"UNHANDLED_REJECTION"');
    expect(text).toContain('rejected!');
  });
});

describe('log singleton', () => {
  it('can be imported without loading expoFs eagerly', () => {
    jest.isolateModules(() => {
      jest.doMock('../../src/library/expoFs', () => {
        throw new Error('loaded eagerly');
      });
      expect(() => require('../../src/logging/logger')).not.toThrow();
    });
    jest.dontMock('../../src/library/expoFs');
  });
});
