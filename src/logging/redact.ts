const MAX_DEPTH = 5;
const MAX_ARRAY = 50;
const MAX_STRING = 2000;
const MAX_STACK_LINES = 20;
const MAX_CAUSE_LEVELS = 3;

const MAX_KEYS = 50;
const MAX_KEY = 200;
const MAX_DATA_URI_HEADER = 200;
const NO_COMMA = -1;

const PURE_BASE64 = /^[A-Za-z0-9+/=_\-\s]+$/;
const BASE64_RUN = /[A-Za-z0-9+/_-]{200,}={0,2}/g;
const PAYLOAD_CHAR = /[A-Za-z0-9+/=_%\-]/;

/** Error as a plain object: name, message, code?, fileName?, stack (<= 20 lines), cause (<= 3 levels). */
export function serializeError(e: unknown, depth = 0): unknown {
  if (!(e instanceof Error)) return e;
  const src = e as Error & { code?: unknown; fileName?: unknown; cause?: unknown };
  const out: Record<string, unknown> = { name: src.name, message: src.message };
  if (src.code !== undefined) out.code = src.code;
  if (src.fileName !== undefined) out.fileName = src.fileName;
  if (typeof src.stack === 'string') out.stack = src.stack.split('\n').slice(0, MAX_STACK_LINES).join('\n');
  if (src.cause !== undefined && depth < MAX_CAUSE_LEVELS) out.cause = serializeError(src.cause, depth + 1);
  return out;
}

function skipPayload(s: string, i: number): number {
  while (i < s.length && PAYLOAD_CHAR.test(s[i])) i++;
  return i;
}

// Replaces every `data:<mime>;base64,<payload>` (any case, anywhere). Linear: header scan is bounded.
function replaceDataUris(s: string): string {
  const lower = s.toLowerCase();
  let out = '';
  let pos = 0;
  let nextComma = s.indexOf(',');
  let from = lower.indexOf('data:');
  while (from !== -1) {
    const headerStart = from + 5;
    if (nextComma !== NO_COMMA && nextComma < headerStart) nextComma = s.indexOf(',', headerStart);
    const comma = nextComma !== NO_COMMA && nextComma - headerStart <= MAX_DATA_URI_HEADER ? nextComma : -1;
    const header = comma === -1 ? '' : lower.slice(headerStart, comma);
    if (comma !== -1 && header.endsWith(';base64')) {
      let end = comma + 1;
      end = skipPayload(s, end);
      // Wrapped payload: keep consuming whole lines (>= 16 payload chars, or a short padded last line).
      for (;;) {
        let j = end;
        while (j < s.length && /\s/.test(s[j])) j++;
        if (j === end) break;
        const tokenEnd = skipPayload(s, j);
        const len = tokenEnd - j;
        if (len >= 16) { end = tokenEnd; continue; }
        if (len > 0 && s[tokenEnd - 1] === '=') end = tokenEnd;
        break;
      }
      const mime = header.split(';')[0].trim();
      out += s.slice(pos, from) + `[data-uri ${mime || 'unknown'}, ${end - from} chars]`;
      pos = end;
      from = lower.indexOf('data:', end);
    } else {
      from = lower.indexOf('data:', headerStart);
    }
  }
  return pos === 0 ? s : out + s.slice(pos);
}

function isPureBase64(s: string): boolean {
  if (!PURE_BASE64.test(s)) return false;
  if (!/\s/.test(s)) return s.length >= 200;
  const tokens = s.split(/\s+/).filter(Boolean);
  const chars = tokens.reduce((n, t) => n + t.length, 0);
  return chars >= 200 && chars / tokens.length >= 16;
}

function redactString(input: string): string {
  const s = replaceDataUris(input);
  if (isPureBase64(s)) return `[base64 ${s.length} chars]`;
  let out = s.replace(BASE64_RUN, (run) => `[base64 ${run.length} chars]`);
  if (out.length > MAX_STRING) out = out.slice(0, MAX_STRING) + `…[+${out.length - MAX_STRING} chars]`;
  return out;
}

function redactKey(key: string): string {
  const k = redactString(key);
  return k.length > MAX_KEY ? k.slice(0, MAX_KEY) + `…[+${k.length - MAX_KEY} chars]` : k;
}

const DROP = Symbol('drop');

function walk(value: unknown, depth: number, ancestors: object[]): unknown {
  switch (typeof value) {
    case 'function':
    case 'symbol':
    case 'undefined':
      return DROP;
    case 'string':
      return redactString(value);
    case 'bigint':
      return value.toString();
    case 'number':
      return Number.isFinite(value) ? value : String(value);
    case 'boolean':
      return value;
  }
  if (value === null) return null;
  const obj = value as object;
  if (obj instanceof ArrayBuffer) return `[binary ${obj.byteLength} bytes]`;
  if (ArrayBuffer.isView(obj)) return `[binary ${obj.byteLength} bytes]`;
  if (ancestors.includes(obj)) return '[circular]';
  if (depth > MAX_DEPTH) return '[depth]';
  if (obj instanceof Date) return isNaN(obj.getTime()) ? 'Invalid Date' : obj.toISOString();
  const next = [...ancestors, obj];
  if (obj instanceof Error) return walk(serializeError(obj), depth, ancestors);
  if (Array.isArray(obj)) {
    const out: unknown[] = [];
    for (const item of obj.slice(0, MAX_ARRAY)) {
      const r = walk(item, depth + 1, next);
      if (r !== DROP) out.push(r);
    }
    if (obj.length > MAX_ARRAY) out.push(`[+${obj.length - MAX_ARRAY} items]`);
    return out;
  }
  const out: Record<string, unknown> = {};
  const keys = Object.keys(obj);
  for (const key of keys.slice(0, MAX_KEYS)) {
    const r = walk((obj as Record<string, unknown>)[key], depth + 1, next);
    if (r !== DROP) out[redactKey(key)] = r;
  }
  if (keys.length > MAX_KEYS) out[`[+${keys.length - MAX_KEYS} keys]`] = true;
  return out;
}

/** JSON-safe copy with binary, base64, long strings, depth, arrays and cycles bounded. */
export function redact(value: unknown): unknown {
  const r = walk(value, 0, []);
  return r === DROP ? undefined : r;
}
