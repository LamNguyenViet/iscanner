import type { PlatformUpdate, UpdateConfig } from './config';

export type UpdateKind = 'force' | 'optional' | 'none';
export type Decision = { kind: UpdateKind; target?: PlatformUpdate };

export function decideUpdate(config: UpdateConfig | null, platform: 'android' | 'ios', currentBuild: number): Decision {
  const target = config?.[platform];
  if (!target) return { kind: 'none' };
  if (currentBuild < target.minBuild) return { kind: 'force', target };
  if (currentBuild < target.latestBuild) return { kind: 'optional', target };
  return { kind: 'none' };
}

export function shouldCheck(lastCheckedAt: number | null | undefined, now: number, minIntervalMs = 30 * 60_000): boolean {
  if (lastCheckedAt === null || lastCheckedAt === undefined) return true;
  return now - lastCheckedAt >= minIntervalMs;
}

/** A snooze applies only to the same latest build, until its expiry time. */
export function isSnoozed(
  snooze: { build: number; until: number } | null | undefined,
  latestBuild: number,
  now: number,
): boolean {
  return !!snooze && snooze.build === latestBuild && now < snooze.until;
}

/** A failed check still blocks while the installed build is below a remembered force. */
export function effectiveDecision(
  fresh: Decision | 'failed',
  remembered: { forceMinBuild?: number } | undefined,
  currentBuild: number,
): Decision & { fromMemory?: boolean } {
  if (fresh !== 'failed') return fresh;
  if (remembered?.forceMinBuild !== undefined && currentBuild < remembered.forceMinBuild) {
    return { kind: 'force', fromMemory: true };
  }
  return { kind: 'none' };
}
