import Constants from 'expo-constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { toAppError } from '../errors/AppError';
import { useErrorAlert } from '../errors/useErrorAlert';
import { useLocale } from '../i18n/LocaleContext';
import type { FsAdapter } from '../library/types';
import { log } from '../logging/logger';
import { downloadAndInstallApk, openUpdatePage } from '../native/apkInstaller';
import { currentAppBuild } from '../native/appBuild';
import { fetchUpdateConfig } from '../native/updateConfigFetch';
import { clearUpdateCache } from '../native/updateCache';
import { loadSettings, saveUpdateState, type UpdateState } from '../settings/settings';
import { useForegroundCheck } from '../workflows/useForegroundCheck';
import { parseUpdateConfig, type PlatformUpdate, type UpdateConfig } from './config';
import { decideUpdate, effectiveDecision, isSnoozed, shouldCheck, type Decision, type UpdateKind } from './decide';

export type UpdateDecision = {
  kind: UpdateKind;
  target?: PlatformUpdate;
  fromMemory?: boolean;
  /** Optional per-language text from the config; the gate prefers it over the built-in copy. */
  message?: UpdateConfig['message'];
};
export type CheckResult = 'none' | 'optional' | 'force' | 'failed';
export type UpdateCheck = {
  decision: UpdateDecision;
  busy: boolean;
  startUpdate(): Promise<void>;
  /** Abandons the running install; its outcome is ignored and the installer is not opened. */
  cancel(): void;
  snooze(): Promise<void>;
  checkNow(): Promise<CheckResult>;
};
export type UpdateDeps = {
  fetchConfig?: (url: string) => Promise<unknown>;
  getBuild?: () => { version: string; build: number };
  platform?: 'android' | 'ios';
  now?: () => number;
  configUrl?: string;
  installApk?: (target: PlatformUpdate, opts?: { isCancelled?: () => boolean }) => Promise<void>;
  openUrl?: (url: string) => Promise<void>;
  clearCache?: () => void;
  fs?: FsAdapter;
};

const SNOOZE_MS = 24 * 60 * 60_000;
const NONE: UpdateDecision = { kind: 'none' };

export function useUpdateCheck(deps: UpdateDeps = {}): UpdateCheck {
  const { t } = useLocale();
  const showError = useErrorAlert();
  const [decision, setDecisionState] = useState<UpdateDecision>(NONE);
  const [busy, setBusy] = useState(false);
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const decisionRef = useRef<UpdateDecision>(NONE);
  const busyRef = useRef(false);
  const token = useRef<{ cancelled: boolean } | null>(null);
  const inFlight = useRef<Promise<CheckResult> | null>(null);
  const mounted = useRef(true);
  const tRef = useRef(t);
  tRef.current = t;

  const setDecision = useCallback((d: UpdateDecision) => {
    decisionRef.current = d;
    if (mounted.current) setDecisionState(d);
  }, []);

  const env = () => {
    const d = depsRef.current;
    return {
      fs: d.fs,
      now: d.now ?? Date.now,
      getBuild: d.getBuild ?? currentAppBuild,
      platform: d.platform ?? (Platform.OS === 'ios' ? ('ios' as const) : ('android' as const)),
      configUrl: d.configUrl ?? (Constants.expoConfig?.extra?.updateConfigUrl as string | undefined) ?? '',
      fetchConfig: d.fetchConfig ?? ((url: string) => fetchUpdateConfig(url, { now: d.now })),
    };
  };

  const saveState = useCallback(async (patch: Partial<UpdateState>) => {
    try {
      await saveUpdateState(patch, env().fs);
    } catch (err) {
      log.warn('update.saveFailed', { cause: err });
    }
  }, []);

  /** One check at a time; a manual check ignores the snooze. */
  const runCheck = useCallback(
    (manual: boolean): Promise<CheckResult> => {
      if (inFlight.current) return inFlight.current;
      const run = async (): Promise<CheckResult> => {
        const e = env();
        if (!e.configUrl) return 'none';
        const { build } = e.getBuild();
        const stored = (await loadSettings(e.fs)).update;
        let fresh: Decision | 'failed';
        let config: UpdateConfig | null = null;
        try {
          config = parseUpdateConfig(await e.fetchConfig(e.configUrl));
          if (!config) throw new Error('invalid update config');
          fresh = decideUpdate(config, e.platform, build);
        } catch (err) {
          log.warn('update.checkFailed', { cause: err });
          fresh = 'failed';
        }
        const now = e.now();
        if (fresh !== 'failed' && fresh.kind === 'optional' && fresh.target && !manual) {
          if (isSnoozed(stored?.snooze, fresh.target.latestBuild, now)) fresh = { kind: 'none' };
        }
        const eff = effectiveDecision(fresh, stored, build);
        const patch: Partial<UpdateState> = { lastCheckedAt: now };
        if (fresh !== 'failed') patch.forceMinBuild = fresh.kind === 'force' ? fresh.target?.minBuild : undefined;
        await saveState(patch);
        if (eff.kind !== 'none') {
          log.info('update.available', { kind: eff.kind, from: build, to: eff.target?.latestBuild });
        }
        setDecision(eff.kind === 'none' ? NONE : { ...eff, message: config?.message });
        return fresh === 'failed' && eff.kind === 'none' ? 'failed' : eff.kind;
      };
      const p = run().finally(() => {
        inFlight.current = null;
      });
      inFlight.current = p;
      return p;
    },
    [saveState, setDecision],
  );

  const autoCheck = useCallback(async () => {
    const e = env();
    const stored = (await loadSettings(e.fs)).update;
    if (!shouldCheck(stored?.lastCheckedAt, e.now())) return;
    await runCheck(false);
  }, [runCheck]);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      const e = env();
      const { build } = e.getBuild();
      const update = (await loadSettings(e.fs)).update;
      const patch: Partial<UpdateState> = { lastBuild: build };
      if (update?.lastBuild !== undefined && update.lastBuild < build) {
        log.info('update.installed', { from: update.lastBuild, to: build });
        (depsRef.current.clearCache ?? clearUpdateCache)();
      }
      const stillForced = update?.forceMinBuild !== undefined && build < update.forceMinBuild;
      if (update?.forceMinBuild !== undefined && !stillForced) patch.forceMinBuild = undefined;
      await saveState(patch);
      // A remembered force blocks at once, even if the check below is throttled or fails.
      const remembered = effectiveDecision('failed', { forceMinBuild: stillForced ? update?.forceMinBuild : undefined }, build);
      if (remembered.kind === 'force') setDecision(remembered);
      await autoCheck();
    })().catch((err) => log.warn('update.checkFailed', { cause: err }));
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useForegroundCheck(() => {
    void autoCheck().catch((err) => log.warn('update.checkFailed', { cause: err }));
  });

  const checkNow = useCallback(() => runCheck(true), [runCheck]);

  const snooze = useCallback(async () => {
    const target = decisionRef.current.target;
    if (target) await saveState({ snooze: { build: target.latestBuild, until: env().now() + SNOOZE_MS } });
    setDecision(NONE);
  }, [saveState, setDecision]);

  const startUpdate = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const mine = { cancelled: false };
    token.current = mine;
    setBusy(true);
    try {
      if (decisionRef.current.fromMemory || !decisionRef.current.target) {
        await runCheck(true);
        const d = decisionRef.current;
        if (d.fromMemory) {
          Alert.alert(tRef.current.update.checkFailed);
          return;
        }
        if (d.kind === 'none' || !d.target) return;
      }
      const target = decisionRef.current.target as PlatformUpdate;
      log.info('update.started');
      const d = depsRef.current;
      if (env().platform === 'ios') await (d.openUrl ?? openUpdatePage)(target.url);
      else await (d.installApk ?? downloadAndInstallApk)(target, { isCancelled: () => mine.cancelled });
    } catch (err) {
      if (mine.cancelled) return;
      log.warn('update.failed', { code: toAppError(err).code });
      showError(err);
    } finally {
      if (!mine.cancelled) {
        busyRef.current = false;
        if (mounted.current) setBusy(false);
      }
    }
  }, [runCheck, showError]);

  const cancel = useCallback(() => {
    if (token.current) token.current.cancelled = true;
    token.current = null;
    busyRef.current = false;
    if (mounted.current) setBusy(false);
  }, []);

  return { decision, busy, startUpdate, cancel, snooze, checkNow };
}
