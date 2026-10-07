import type { UpdateConfig } from '../../src/update/config';
import { decideUpdate, effectiveDecision, isSnoozed, shouldCheck } from '../../src/update/decide';

const target = { minBuild: 7, latestBuild: 9, url: 'https://x.test/a.apk', md5: 'a'.repeat(32) };
const config: UpdateConfig = { android: target };
const MIN = 60_000;
const HOUR = 60 * MIN;

test.each([[6, 'force'], [7, 'optional'], [8, 'optional'], [9, 'none'], [10, 'none']])(
  'build %i is %s', (build, kind) => {
    const r = decideUpdate(config, 'android', build);
    expect(r.kind).toBe(kind);
    if (kind !== 'none') expect(r.target).toBe(target);
  },
);

test('missing platform or null config is none', () => {
  expect(decideUpdate(config, 'ios', 1)).toEqual({ kind: 'none' });
  expect(decideUpdate(null, 'android', 1)).toEqual({ kind: 'none' });
});

test('shouldCheck', () => {
  expect(shouldCheck(null, 1000)).toBe(true);
  expect(shouldCheck(undefined, 1000)).toBe(true);
  expect(shouldCheck(0, 29 * MIN)).toBe(false);
  expect(shouldCheck(0, 30 * MIN)).toBe(true);
  expect(shouldCheck(0, 5 * MIN, 5 * MIN)).toBe(true);
});

test('isSnoozed', () => {
  const now = 1_000_000;
  const snooze = { build: 9, until: now + 24 * HOUR };
  expect(isSnoozed(snooze, 9, now)).toBe(true);
  expect(isSnoozed(snooze, 10, now)).toBe(false);
  expect(isSnoozed({ build: 9, until: now }, 9, now)).toBe(false);
  expect(isSnoozed({ build: 9, until: now - 1 }, 9, now)).toBe(false);
  expect(isSnoozed(null, 9, now)).toBe(false);
  expect(isSnoozed(undefined, 9, now)).toBe(false);
});

test('effectiveDecision keeps a remembered force when the check failed', () => {
  expect(effectiveDecision('failed', { forceMinBuild: 8 }, 7)).toEqual({ kind: 'force', fromMemory: true });
  expect(effectiveDecision('failed', { forceMinBuild: 8 }, 8)).toEqual({ kind: 'none' });
  expect(effectiveDecision('failed', undefined, 1)).toEqual({ kind: 'none' });
  expect(effectiveDecision('failed', {}, 1)).toEqual({ kind: 'none' });
});

test('a fresh result wins over memory', () => {
  expect(effectiveDecision({ kind: 'none' }, { forceMinBuild: 99 }, 1)).toEqual({ kind: 'none' });
  expect(effectiveDecision({ kind: 'optional', target }, { forceMinBuild: 99 }, 1)).toEqual({ kind: 'optional', target });
  expect(effectiveDecision({ kind: 'force', target }, undefined, 1)).toEqual({ kind: 'force', target });
});
