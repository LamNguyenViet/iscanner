export async function fetchUpdateConfig(
  url: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch; now?: () => number } = {},
): Promise<unknown> {
  const { timeoutMs = 5000, fetchImpl = fetch, now = Date.now } = opts;
  const full = `${url}${url.includes('?') ? '&' : '?'}t=${now()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(full, {
      headers: { 'Cache-Control': 'no-cache' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
