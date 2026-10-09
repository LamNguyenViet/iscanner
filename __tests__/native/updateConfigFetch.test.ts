import { fetchUpdateConfig } from '../../src/native/updateConfigFetch';

const okResponse = (body: string, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
  json: async () => JSON.parse(body),
});

test('returns parsed JSON and sets cache-buster and header', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(okResponse('{"a":1}'));
  const out = await fetchUpdateConfig('https://x.test/u.json', { fetchImpl, now: () => 123 });
  expect(out).toEqual({ a: 1 });
  expect(fetchImpl.mock.calls[0][0]).toBe('https://x.test/u.json?t=123');
  expect(fetchImpl.mock.calls[0][1].headers['Cache-Control']).toBe('no-cache');
});

test('uses & when the url already has a query', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(okResponse('{}'));
  await fetchUpdateConfig('https://x.test/u.json?v=1', { fetchImpl, now: () => 5 });
  expect(fetchImpl.mock.calls[0][0]).toBe('https://x.test/u.json?v=1&t=5');
});

test('throws on HTTP 500', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(okResponse('{}', 500));
  await expect(fetchUpdateConfig('https://x.test/u.json', { fetchImpl })).rejects.toThrow();
});

test('throws on invalid JSON', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(okResponse('not json'));
  await expect(fetchUpdateConfig('https://x.test/u.json', { fetchImpl })).rejects.toThrow();
});

test('aborts after 5000 ms', async () => {
  jest.useFakeTimers();
  try {
    const fetchImpl = jest.fn(
      (_u: string, init: { signal: AbortSignal }) =>
        new Promise((_res, rej) => {
          init.signal.addEventListener('abort', () => rej(new Error('aborted')));
        }),
    );
    const p = fetchUpdateConfig('https://x.test/u.json', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const assertion = expect(p).rejects.toThrow('aborted');
    await jest.advanceTimersByTimeAsync(5000);
    await assertion;
  } finally {
    jest.useRealTimers();
  }
});
