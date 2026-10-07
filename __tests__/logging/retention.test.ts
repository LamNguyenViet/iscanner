import { expiredLogFiles } from '../../src/logging/retention';

describe('expiredLogFiles', () => {
  it('keeps today + 6 previous days, ignores other names and future files', () => {
    const names = ['2026-09-30.log', '2026-10-01.log', '2026-10-07.log', '2026-10-09.log', 'notes.txt', '2026-13-01.log'];
    expect(expiredLogFiles(names, new Date(2026, 9, 7, 12))).toEqual(['2026-09-30.log']);
  });
});
