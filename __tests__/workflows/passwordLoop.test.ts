import { withPasswordLoop } from '../../src/workflows/passwordLoop';

const mockLog = jest.requireMock('../../src/logging/logger').log;
class Need extends Error {}
class Wrong extends Error {}

function opener(correct: string | null) {
  return jest.fn(async (p: string | undefined) => {
    if (correct === null) return 'ok';
    if (p === undefined) throw new Need();
    if (p !== correct) throw new Wrong();
    return 'ok';
  });
}
const base = {
  fileName: 'f',
  needsPassword: (e: unknown) => e instanceof Need,
  wrongPassword: (e: unknown) => e instanceof Wrong,
  event: 'word' as const,
};

beforeEach(() => jest.clearAllMocks());

describe('withPasswordLoop', () => {
  it('opens without a password: no ask, no log', async () => {
    const ask = jest.fn();
    expect(await withPasswordLoop(opener(null), { ...base, ask })).toEqual({ value: 'ok' });
    expect(ask).not.toHaveBeenCalled();
    expect(mockLog.info).not.toHaveBeenCalled();
  });

  it('tries the empty password silently', async () => {
    const ask = jest.fn();
    expect(await withPasswordLoop(opener(''), { ...base, ask })).toEqual({ value: 'ok', password: '' });
    expect(ask).not.toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith('word.unlocked', { file: 'f' });
  });

  it('asks again with wrongBefore after a wrong answer', async () => {
    const ask = jest.fn().mockResolvedValueOnce('nope').mockResolvedValueOnce('secret');
    const res = await withPasswordLoop(opener('secret'), { ...base, ask });
    expect(res).toEqual({ value: 'ok', password: 'secret' });
    expect(ask.mock.calls).toEqual([
      ['f', false],
      ['f', true],
    ]);
  });

  it('returns null and logs when skipped', async () => {
    const ask = jest.fn().mockResolvedValue(null);
    expect(await withPasswordLoop(opener('secret'), { ...base, ask, event: 'pdf' })).toBeNull();
    expect(mockLog.info).toHaveBeenCalledWith('pdf.unlockSkipped', { file: 'f' });
  });

  it('rethrows the first error without ask', async () => {
    await expect(withPasswordLoop(opener('secret'), base)).rejects.toBeInstanceOf(Need);
  });

  it('tries empty after a wrong known password, then asks with wrongBefore', async () => {
    const open = opener('secret');
    const ask = jest.fn().mockResolvedValue('secret');
    await withPasswordLoop(open, { ...base, ask, known: 'bad' });
    expect(open.mock.calls.map((c) => c[0])).toEqual(['bad', '', 'secret']);
    expect(ask).toHaveBeenCalledWith('f', true);
  });
});
