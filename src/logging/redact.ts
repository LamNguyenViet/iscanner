const MAX_DEPTH = 5;
const MAX_ARRAY = 50;
const MAX_STRING = 2000;
const MAX_STACK_LINES = 20;
const MAX_CAUSE_LEVELS = 3;

const DATA_URI = /^data:([^;,]*)[^,]*;base64,/;
const BASE64 = /^[A-Za-z0-9+/=\r\n]{200,}$/;

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

function redactString(s: string): string {
  const uri = DATA_URI.exec(s);
  if (uri) return `[data-uri ${uri[1] || 'unknown'}, ${s.length} chars]`;
  if (BASE64.test(s)) return `[base64 ${s.length} chars]`;
  if (s.length > MAX_STRING) return s.slice(0, MAX_STRING) + `…[+${s.length - MAX_STRING} chars]`;
  return s;
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
  for (const key of Object.keys(obj)) {
    const r = walk((obj as Record<string, unknown>)[key], depth + 1, next);
    if (r !== DROP) out[key] = r;
  }
  return out;
}

/** JSON-safe copy with binary, base64, long strings, depth, arrays and cycles bounded. */
export function redact(value: unknown): unknown {
  const r = walk(value, 0, []);
  return r === DROP ? undefined : r;
}
