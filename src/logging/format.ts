import { redact, serializeError } from './redact';

export { serializeError };

export type Level = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type LogRecord = {
  t: string; lvl: Level; code?: string; event?: string; msg?: string; file?: string;
  data?: unknown; cause?: unknown; app?: string; os?: string;
};

const p = (n: number, w = 2) => String(n).padStart(w, '0');

/** Local wall-clock time with the device offset, e.g. 2026-10-07T19:35:12.481+07:00. */
export function localIsoTimestamp(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`;
}

/** Log file name for the local date, e.g. 2026-10-07.log. */
export function logFileName(d: Date): string {
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.log`;
}

/** One JSON line, always redacted; never throws. */
export function formatRecord(r: LogRecord): string {
  try {
    return JSON.stringify(redact(r)) + '\n';
  } catch {
    let t = '';
    let lvl: string = 'error';
    try { t = String(r.t); lvl = String(r.lvl); } catch { /* keep defaults */ }
    return JSON.stringify({ t, lvl, msg: '[unserializable]' }) + '\n';
  }
}
