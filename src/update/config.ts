export type PlatformUpdate = { minBuild: number; latestBuild: number; url: string; md5?: string; size?: number };
export type UpdateConfig = {
  android?: PlatformUpdate;
  ios?: PlatformUpdate;
  message?: { vi?: string; en?: string };
};

const MAX_MESSAGE = 300;
const MD5_RE = /^[0-9a-fA-F]{32}$/;

function isBuild(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1;
}

function isHttps(u: unknown): u is string {
  if (typeof u !== 'string') return false;
  try {
    return new URL(u).protocol === 'https:';
  } catch {
    return false;
  }
}

function parsePlatform(raw: unknown, needMd5: boolean): PlatformUpdate | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (!isBuild(r.minBuild) || !isBuild(r.latestBuild) || r.latestBuild < r.minBuild) return undefined;
  if (!isHttps(r.url)) return undefined;
  const out: PlatformUpdate = { minBuild: r.minBuild, latestBuild: r.latestBuild, url: r.url };
  if (r.md5 !== undefined && r.md5 !== null) {
    if (typeof r.md5 !== 'string' || !MD5_RE.test(r.md5)) return undefined;
    out.md5 = r.md5;
  } else if (needMd5) {
    return undefined;
  }
  if (r.size !== undefined && r.size !== null) {
    if (typeof r.size !== 'number' || !Number.isInteger(r.size) || r.size <= 0) return undefined;
    out.size = r.size;
  }
  return out;
}

function parseMessage(raw: unknown): UpdateConfig['message'] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: { vi?: string; en?: string } = {};
  if (typeof r.vi === 'string') out.vi = r.vi.slice(0, MAX_MESSAGE);
  if (typeof r.en === 'string') out.en = r.en.slice(0, MAX_MESSAGE);
  return out.vi !== undefined || out.en !== undefined ? out : undefined;
}

/** Invalid platform blocks are dropped; with none left the result is null. */
export function parseUpdateConfig(json: unknown): UpdateConfig | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null;
  const r = json as Record<string, unknown>;
  const android = parsePlatform(r.android, true);
  const ios = parsePlatform(r.ios, false);
  if (!android && !ios) return null;
  const config: UpdateConfig = {};
  if (android) config.android = android;
  if (ios) config.ios = ios;
  const message = parseMessage(r.message);
  if (message) config.message = message;
  return config;
}
