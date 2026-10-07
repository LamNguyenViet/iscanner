import type { Logger } from './logger';

type Handler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsLike = {
  getGlobalHandler(): Handler;
  setGlobalHandler(handler: Handler): void;
};
type TrackerLike = {
  enable(options: {
    allRejections?: boolean;
    onUnhandled: (id: number, error: unknown) => void;
    onHandled?: (id: number) => void;
  }): void;
};

const FLUSH_TIMEOUT_MS = 500;

function defaultTracker(): TrackerLike | undefined {
  const hermes = (globalThis as { HermesInternal?: { enablePromiseRejectionTracker?: unknown } })
    .HermesInternal;
  const enable = hermes?.enablePromiseRejectionTracker;
  return typeof enable === 'function'
    ? { enable: (opts) => (enable as (o: unknown) => void).call(hermes, opts) }
    : undefined;
}

/** Bounded flush: never waits more than FLUSH_TIMEOUT_MS if flush hangs. */
async function boundedFlush(logger: Logger): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, FLUSH_TIMEOUT_MS);
  });
  try {
    await Promise.race([logger.flush(), timeout]);
  } catch {
    // never block the crash path
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function installGlobalHandlers(
  logger: Logger,
  deps: { errorUtils?: ErrorUtilsLike; tracker?: TrackerLike } = {},
): () => void {
  const errorUtils =
    deps.errorUtils ?? (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  let restore: (() => void) | undefined;

  if (errorUtils) {
    const previous = errorUtils.getGlobalHandler();
    const handler: Handler = (error, isFatal) => {
      try {
        logger.fatal(isFatal === false ? 'Uncaught JS error (non-fatal)' : 'Uncaught JS error', error);
      } catch {
        // never throw
      }
      void boundedFlush(logger).then(() => previous(error, isFatal));
    };
    errorUtils.setGlobalHandler(handler);
    restore = () => errorUtils.setGlobalHandler(previous);
  }

  const tracker = deps.tracker ?? defaultTracker();
  tracker?.enable({
    allRejections: true,
    onUnhandled: (_id, error) => {
      try {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('UNHANDLED_REJECTION', msg, { cause: error });
      } catch {
        // never throw
      }
    },
  });

  return () => restore?.();
}
