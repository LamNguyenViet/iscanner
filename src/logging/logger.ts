import type { FsAdapter } from '../library/types';
import { formatRecord, localIsoTimestamp, logFileName, type Level, type LogRecord } from './format';
import { expiredLogFiles } from './retention';

export type Logger = {
  debug(msg: string, data?: unknown): void;
  info(event: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(code: string, msg: string, extra?: { file?: string; cause?: unknown; data?: unknown }): void;
  fatal(msg: string, cause: unknown): void;
  flush(): Promise<void>;
  init(meta: { app: string; os: string }): Promise<void>;
};

export const FLUSH_INTERVAL_MS = 2000;
export const MAX_BUFFER = 500;
export const DAILY_CAP_BYTES = 2 * 1024 * 1024;

type Entry = { file: string; lvl: Level; line: string };

export function createLogger(deps: {
  fs: FsAdapter;
  now?: () => Date;
  console?: Pick<Console, 'log' | 'warn' | 'error'>;
  dev?: boolean;
  dir?: string;
}): Logger {
  const { fs } = deps;
  const now = deps.now ?? (() => new Date());
  const dir = deps.dir ?? 'logs';
  const cons = deps.console ?? console;
  const dev = deps.dev ?? false;

  let meta: { app: string; os: string } | null = null;
  let buffer: Entry[] = [];
  let dropped = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  // Daily cap: chars already in a day's file, read once per file name on its
  // first write by this process, then incremented by what this process writes.
  const sizes = new Map<string, number>();

  const mirror = (lvl: Level, line: string) => {
    if (!dev) return;
    try {
      const text = line.trimEnd();
      if (lvl === 'warn') cons.warn(text);
      else if (lvl === 'error' || lvl === 'fatal') cons.error(text);
      else cons.log(text);
    } catch {
      // never throw
    }
  };

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const enqueue = (rec: Omit<LogRecord, 't'>, immediate: boolean) => {
    try {
      const d = now();
      const full: LogRecord = { t: localIsoTimestamp(d), ...rec };
      if (meta && (rec.lvl === 'error' || rec.lvl === 'fatal' || rec.event === 'app.start')) {
        full.app = meta.app;
        full.os = meta.os;
      }
      const line = formatRecord(full);
      mirror(rec.lvl, line);
      if (buffer.length >= MAX_BUFFER) {
        buffer.shift();
        dropped++;
      }
      buffer.push({ file: logFileName(d), lvl: rec.lvl, line });
      if (immediate) {
        void flush();
      } else if (timer === null) {
        timer = setTimeout(() => {
          timer = null;
          void flush();
        }, FLUSH_INTERVAL_MS);
      }
    } catch {
      // never throw
    }
  };

  const writeBatch = async (batch: Entry[]) => {
    // Group consecutive entries by file, preserving order.
    const groups: { file: string; entries: Entry[] }[] = [];
    for (const e of batch) {
      const last = groups[groups.length - 1];
      if (last && last.file === e.file) last.entries.push(e);
      else groups.push({ file: e.file, entries: [e] });
    }
    for (const g of groups) {
      try {
        const path = `${dir}/${g.file}`;
        if (!sizes.has(g.file)) {
          const existing = await fs.readText(path);
          sizes.set(g.file, existing ? existing.length : 0);
        }
        let size = sizes.get(g.file) ?? 0;
        let text = '';
        for (const e of g.entries) {
          const capped = size >= DAILY_CAP_BYTES;
          if (capped && (e.lvl === 'info' || e.lvl === 'debug')) continue;
          text += e.line;
          size += e.line.length;
        }
        if (!text) continue;
        await fs.append(path, text);
        sizes.set(g.file, size);
      } catch {
        // disk full / write error: drop silently
      }
    }
  };

  function flush(): Promise<void> {
    clearTimer();
    chain = chain.then(async () => {
      try {
        if (buffer.length === 0 && dropped === 0) return;
        const batch = buffer;
        buffer = [];
        const n = dropped;
        dropped = 0;
        if (n > 0) {
          const d = now();
          const line = formatRecord({
            t: localIsoTimestamp(d),
            lvl: 'warn',
            msg: 'log buffer overflow',
            data: { dropped: n },
          });
          batch.unshift({ file: logFileName(d), lvl: 'warn', line });
        }
        await writeBatch(batch);
      } catch {
        // never throw
      }
    });
    return chain;
  }

  return {
    debug(msg, data) {
      if (!dev) return;
      try {
        cons.log(msg, data);
      } catch {
        // never throw
      }
    },
    info(event, data) {
      enqueue({ lvl: 'info', event, data }, false);
    },
    warn(msg, data) {
      enqueue({ lvl: 'warn', msg, data }, false);
    },
    error(code, msg, extra) {
      enqueue(
        { lvl: 'error', code, msg, file: extra?.file, cause: extra?.cause, data: extra?.data },
        true,
      );
    },
    fatal(msg, cause) {
      enqueue({ lvl: 'fatal', msg, cause }, true);
    },
    flush,
    async init(m) {
      try {
        meta = m;
        const names = await fs.list(dir);
        for (const name of expiredLogFiles(names, now())) {
          try {
            await fs.delete(`${dir}/${name}`);
          } catch {
            // best-effort
          }
        }
      } catch {
        // never throw
      }
    },
  };
}

let singleton: Logger | null = null;
function getSingleton(): Logger {
  if (!singleton) {
    // Lazy require: importing this module must not touch native modules.
    const { expoFs } = require('../library/expoFs') as typeof import('../library/expoFs');
    singleton = createLogger({ fs: expoFs, dev: __DEV__ });
  }
  return singleton;
}

/** App singleton over expoFs (created on first use). */
export const log: Logger = {
  debug: (m, d) => getSingleton().debug(m, d),
  info: (e, d) => getSingleton().info(e, d),
  warn: (m, d) => getSingleton().warn(m, d),
  error: (c, m, x) => getSingleton().error(c, m, x),
  fatal: (m, c) => getSingleton().fatal(m, c),
  flush: () => getSingleton().flush(),
  init: (meta) => getSingleton().init(meta),
};
