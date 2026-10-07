# Force Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Below the Gist's `minBuild`, the app is blocked until it is updated. Below `latestBuild`, the user gets a prompt they can dismiss.
- Android downloads the APK, verifies its MD5 and opens the system installer. iOS opens an instruction URL.
- Release builds are signed with a private key.

**Architecture:**
- Pure logic lives in `src/update/` (`config.ts`, `decide.ts`).
- The persisted `update` state goes in the shared settings file.
- Native edges live in `src/native/` (`updateConfigFetch.ts`, `apkInstaller.ts`).
- The hook `useUpdateCheck` and the component `UpdateGate` are mounted in `app/_layout.tsx`. Settings gets a version line and a "Check for updates" row.
- Release signing comes from the repo config plugin `plugins/withReleaseSigning.js`, which reads Gradle properties stored outside the repo.

**Tech Stack:**
- Expo SDK 57: `expo-file-system` (`File.downloadFileAsync`, `File.md5`, `File.contentUri`), `expo-intent-launcher` and `expo-application` (both new; install with `npx expo install`), `expo-constants`, and `@expo/config-plugins` (`withAppBuildGradle`).
- RN 0.86 (`Linking`, `BackHandler`).
- Jest + RNTL v14 (async).

**Spec:** `docs/superpowers/specs/2026-10-07-force-update-design.md`. It holds the exact config rules (§2.1), the decision rules (§2.2), the steps (§2.5), the plugin (§2.6), and the copy tables and UI (§2.7).

## Global Constraints

- **Comparison:** by native build number only. Android uses `Application.nativeBuildVersion` (versionCode); iOS uses `Application.nativeBuildVersion` (buildNumber). Parse both as integers.
- **Decision:**
  - `force` if current < `minBuild`;
  - `optional` if current < `latestBuild`;
  - `none` otherwise, and also when the config is missing or invalid.
  - A check that fails never blocks, unless a remembered `forceMinBuild` is greater than the current build.
- **Config validation:**
  - builds are integers ≥ 1, and `latestBuild ≥ minBuild`;
  - `url` must be `https:`;
  - Android `md5` must be 32 hex characters (case-insensitive);
  - `size` is optional and a positive integer;
  - each `message` is capped at 300 characters;
  - an invalid platform block is dropped, and if both are dropped the result is `null`.
- **Checks:**
  - 5 s timeout and a `?t=<now>` cache-buster;
  - at most one automatic check per 30 minutes;
  - a "Later" snooze lasts 24 h and applies only to the same `latestBuild`.
- **Config URL:** `app.json` → `expo.extra.updateConfigUrl` (read with `expo-constants`). When it is empty or missing, no check runs and the result is `none`.
- **Android install:** the temp directory is `Paths.cache/update/`, holding `iScanner-<latestBuild>.apk`. The intent is `startActivityAsync('android.intent.action.VIEW', { data: file.contentUri, type: 'application/vnd.android.package-archive', flags: 0x1 | 0x10000000 })`.
- **New error codes**, as AppError subclasses with copy from spec §2.7: `UPDATE_DOWNLOAD` (`UpdateDownloadError`), `UPDATE_CORRUPT` (`UpdateCorruptError`), `UPDATE_INSTALL` (`UpdateInstallError`).
- **Copy:** use the vi/en copy from spec §2.7 exactly. All copy stays in `src/i18n/`, and the Vietnamese guard and the no-console guard must stay green.
- **Logs:** `update.available {kind, from, to}`, `update.checkFailed` (warn), `update.started`, `update.failed {code}`, `update.installed {from, to}`.
- **Signing:**
  - The Gradle property names are exactly `ISCANNER_UPLOAD_STORE_FILE`, `ISCANNER_UPLOAD_STORE_PASSWORD`, `ISCANNER_UPLOAD_KEY_ALIAS` and `ISCANNER_UPLOAD_KEY_PASSWORD`.
  - No secret or keystore goes in the repo.
  - When the properties are missing, the build signs with the debug key and prints a warning.
  - The plugin edit must be idempotent.
- **Version:** 1.7.0, `android.versionCode` 7, `ios.buildNumber` "7". `android.permissions` gains `android.permission.REQUEST_INSTALL_PACKAGES`.
- **Gates:** `npm test` and `npm run typecheck` pass at the end of every task.
- **Do not touch:** `.gitignore`, `.claude/`, `docs/claude-memory/`, `requirement/`, `New folder/`, `ios/` or `android/`. Configure native behaviour through `app.json` and the plugin only.

## Review Focus

1. **Offline after a force was remembered.** Expected: the app stays blocked, even after a restart. Once a later successful check says `minBuild` is at or below the current build, the block lifts. Pinned in Task 1 (`effectiveDecision`) and Task 4 (layout with a mocked failing fetch and a stored `forceMinBuild`).
2. **A malicious or broken Gist** (an `http://` URL, a missing md5, `minBuild` > `latestBuild`, a huge message, non-JSON content). Expected: the result is `none`, the app is never blocked, and nothing crashes. Pinned in Task 1 (parser) and Task 2 (fetch).
3. **Downloaded APK MD5 mismatch, or a download or intent failure.** Expected: the file is deleted, a typed error popup is shown, and the block remains with Update available again. Pinned in Task 2 (installer) and Task 4 (gate).
4. **Android back button on the force screen.** Expected: back is consumed and the user cannot reach the app. Pinned in Task 4.
5. **A successful update.** Expected: on the next start the build has increased, `update.installed` is logged, `cache/update/` is deleted, and the remembered force is cleared. Pinned in Task 4.

---

### Task 1: Pure update logic, errors and copy

**Files:**
- Create: `src/update/config.ts`, `src/update/decide.ts`
- Modify:
  - `src/settings/settings.ts`: add `update` to `Settings` (shape in spec §2.4), with validation in `parseSettings`. Keep `theme` and `language` behaviour unchanged.
  - `src/errors/AppError.ts`: add 3 classes and 3 codes to `ErrorCode`.
  - `src/i18n/vi.ts`, `src/i18n/en.ts`: the `update.*` and `settings.version`/`settings.checkUpdate` keys, plus `errors.UPDATE_*`. The functions `update.downloading(mb?: number)`, `update.current(v, b)` and `settings.version(v, b)` must match spec §2.7.
- Test: `__tests__/update/config.test.ts`, `__tests__/update/decide.test.ts`, `__tests__/settings/settings.test.ts`, `__tests__/errors/AppError.test.ts`, `__tests__/errors/messages.test.ts`

**Interfaces (produces):**
- `PlatformUpdate`, `UpdateConfig`, `parseUpdateConfig(json: unknown): UpdateConfig | null`
- `type UpdateKind = 'force' | 'optional' | 'none'`
- `decideUpdate(config: UpdateConfig | null, platform: 'android' | 'ios', currentBuild: number): { kind: UpdateKind; target?: PlatformUpdate }`
- `shouldCheck(lastCheckedAt: number | null | undefined, now: number, minIntervalMs?: number): boolean`
- `isSnoozed(snooze: { build: number; until: number } | null | undefined, latestBuild: number, now: number): boolean`
- `effectiveDecision(fresh: { kind: UpdateKind; target?: PlatformUpdate } | 'failed', remembered: { forceMinBuild?: number } | undefined, currentBuild: number): { kind: UpdateKind; target?: PlatformUpdate; fromMemory?: boolean }`. When the check failed and `currentBuild < forceMinBuild`, it returns `{ kind: 'force', fromMemory: true }` with no target. The UI then shows the block, and Update re-runs the check before downloading.

- [ ] **Step 1: write the failing tests.**
  - `parseUpdateConfig`:
    - the spec §2.1 example is accepted;
    - each invalid field drops its platform block: `minBuild` of 0, non-integer builds, `latestBuild < minBuild`, an `http:` URL, Android without md5, md5 of the wrong length or with non-hex characters, `size` ≤ 0;
    - both blocks invalid, `null`, a string, or an array all give `null`;
    - a 400-character message is truncated to 300;
    - an uppercase md5 is accepted.
  - `decideUpdate`: with `{min:7, latest:9}`, build 6 → `force`, 7 → `optional`, 8 → `optional`, 9 → `none`, 10 → `none`. A missing platform → `none`; a `null` config → `none`.
  - `shouldCheck`: `null` → true; 29 min → false; 30 min → true.
  - `isSnoozed`: same build within 24 h → true; a different `latestBuild` → false; expired → false.
  - `effectiveDecision`:
    - `'failed'` + `{forceMinBuild: 8}` + current 7 → `force` with `fromMemory`;
    - `'failed'` + current 8 → `none`;
    - a fresh `none` always wins over memory.
  - `parseSettings`:
    - a valid `update` block is kept;
    - an invalid block (e.g. `lastCheckedAt: 'x'`) → `update` undefined, with theme and language unaffected;
    - the old files `{"theme":"dark"}` and `{"theme":"dark","language":"en"}` still parse as before.
  - Errors: the 3 new classes have the right `code`/`name` and `instanceof AppError`; `errorContent` gives the exact vi/en titles and messages from spec §2.7 for the 3 codes.
- [ ] **Step 2:** run the tests → FAIL.
- [ ] **Step 3:** implement. The modules are pure and have no React or RN imports.
- [ ] **Step 4:** run the tests → PASS; then `npm test` and `npm run typecheck`.
- [ ] **Step 5:** commit — `feat: update config parsing, decision rules and update error copy`.

### Task 2: Config fetch and the Android APK installer

**Files:**
- Create: `src/native/updateConfigFetch.ts`, `src/native/apkInstaller.ts`, `src/native/appBuild.ts`
- Modify: `package.json` (`npx expo install expo-intent-launcher expo-application`)
- Test: `__tests__/native/updateConfigFetch.test.ts`, `__tests__/native/apkInstaller.test.ts`, `__tests__/native/appBuild.test.ts`

**Interfaces:**
- **Consumes:** the Task 1 types and error classes.
- **Produces:**
  - `fetchUpdateConfig(url: string, opts?: { timeoutMs?: number; fetchImpl?: typeof fetch; now?: () => number }): Promise<unknown>` returns the parsed JSON. It throws on a timeout (abort), a non-2xx status or invalid JSON. The request URL is `${url}${url.includes('?') ? '&' : '?'}t=${now()}`, with header `Cache-Control: no-cache`.
  - `downloadAndInstallApk(target: PlatformUpdate, deps?: { downloadFile?: (url: string, dest: File) => Promise<File>; startActivity?: typeof IntentLauncher.startActivityAsync; cacheDir?: Directory }): Promise<void>` follows spec §2.5 steps 1–3 exactly and throws the typed errors.
  - `currentAppBuild(): { version: string; build: number }` reads `Application.nativeApplicationVersion` and `nativeBuildVersion` (parsed with `parseInt`). It falls back to `expo-constants` `expoConfig.version` and 0.
  - `openUpdatePage(url: string): Promise<void>` calls `Linking.openURL`. It can live in `apkInstaller.ts` or `appBuild.ts`.

- [ ] **Step 1: write the failing tests.**
  - **fetch:**
    - success → JSON;
    - HTTP 500 → throws;
    - invalid JSON → throws;
    - a never-resolving fetch with fake timers rejects after 5000 ms (the abort happens);
    - the URL gets `?t=` or `&t=` correctly;
    - the header is set.
  - **installer** (mock expo-file-system `File`/`Directory`/`Paths` and expo-intent-launcher, following the mocking style of `__tests__/native/share.test.ts`):
    - success: the old `update/` directory is deleted and recreated; the download goes to `iScanner-8.apk`; md5 is compared case-insensitively; `startActivityAsync` is called with exactly `('android.intent.action.VIEW', { data: <contentUri>, type: 'application/vnd.android.package-archive', flags: 0x10000001 })`;
    - an md5 mismatch deletes the file and throws `UpdateCorruptError`, and `startActivity` is never called;
    - a download rejection → `UpdateDownloadError` with a cause;
    - a `startActivity` rejection → `UpdateInstallError` with a cause.
  - **appBuild:** mocked `expo-application` `'7'` → `{ version: '1.7.0', build: 7 }`; null/garbage → build 0.
- [ ] **Step 2:** run the tests → FAIL.
- [ ] **Step 3:** run `npx expo install expo-intent-launcher expo-application`, then implement.
- [ ] **Step 4:** run the tests → PASS; then `npm test` and `npm run typecheck`.
- [ ] **Step 5:** commit — `feat: fetch update config and install verified APKs on Android`.

### Task 3: Release signing plugin and native config

**Files:**
- Create: `plugins/withReleaseSigning.js`, `__tests__/plugins/withReleaseSigning.test.ts`
- Modify: `app.json`
  - register `"./plugins/withReleaseSigning"`;
  - add `android.permissions` with `"android.permission.REQUEST_INSTALL_PACKAGES"`, merged with any existing permissions;
  - add `extra.updateConfigUrl: ""`;
  - set version 1.7.0, versionCode 7 and buildNumber "7".

**Interfaces:**
- **Produces:** `module.exports = withReleaseSigning` (a config plugin), plus an exported pure helper `applyReleaseSigning(buildGradle: string): string` that the plugin calls inside `withAppBuildGradle`.
- **Behaviour of `applyReleaseSigning`:**
  1. Inside the existing `signingConfigs { … }` block, insert a `release { if (project.hasProperty('ISCANNER_UPLOAD_STORE_FILE')) { storeFile file(ISCANNER_UPLOAD_STORE_FILE); storePassword ISCANNER_UPLOAD_STORE_PASSWORD; keyAlias ISCANNER_UPLOAD_KEY_ALIAS; keyPassword ISCANNER_UPLOAD_KEY_PASSWORD } }` entry after the `debug` entry.
  2. In `buildTypes { release { … } }`, replace `signingConfig signingConfigs.debug` with `signingConfig project.hasProperty('ISCANNER_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug`.
  3. Add a top-level `if (!project.hasProperty('ISCANNER_UPLOAD_STORE_FILE')) { logger.warn('iScanner: release build is signed with the DEBUG key') }` once.
  4. It is idempotent: when it finds its marker comment `// @iscanner-release-signing`, it returns the input unchanged.
  5. If the expected anchors are missing, it throws a clear error. Prebuild should fail loudly rather than ship a misconfigured build.

- [ ] **Step 1: write the failing tests.** Use a fixture string: the template `android/app/build.gradle` sections `signingConfigs { debug { … } }` and `buildTypes { debug {…} release { … signingConfig signingConfigs.debug … } }`, copied from the Expo SDK 57 template or the generated file.
  - The output contains the release block once, the conditional `signingConfig`, the warning and the marker.
  - Applying it twice gives the same output as applying it once.
  - A missing anchor throws.
  - `app.json` checks (read with fs):
    - the plugin is registered;
    - the `REQUEST_INSTALL_PACKAGES` permission is present;
    - `extra.updateConfigUrl` exists;
    - the version is 1.7.0 / 7 / "7".
- [ ] **Step 2:** run the tests → FAIL.
- [ ] **Step 3:** implement. Then run `npx expo config --type introspect` to confirm the plugin resolves and the permission appears, and record the output.
- [ ] **Step 4:** run the tests → PASS; then `npm test` and `npm run typecheck`.
- [ ] **Step 5:** commit — `feat: release signing from local gradle properties; install permission`.

### Task 4: Update hook, gate UI and Settings

**Files:**
- Create: `src/update/useUpdateCheck.ts`, `src/components/UpdateGate.tsx`
- Modify: `app/_layout.tsx` (mount the gate inside the providers, above the Stack), `app/settings.tsx` (version line and Check for updates row in the `Hỗ trợ` group)
- Test: `__tests__/update/useUpdateCheck.test.tsx`, `__tests__/components/UpdateGate.test.tsx`, `__tests__/app/settings.test.tsx`, `__tests__/app/layout.test.tsx`

**Interfaces:**
- **Consumes:** Tasks 1–3, `loadSettings`/`saveSettings`, `log`, `useErrorAlert`, `useLocale`, `useTheme`, `useForegroundCheck`.
- **Produces:** `useUpdateCheck(deps?: { fetchConfig?; getBuild?; platform?: 'android' | 'ios'; now?: () => number; configUrl?: string; installApk?; openUrl? }): { decision: { kind: UpdateKind; target?: PlatformUpdate; fromMemory?: boolean }; busy: boolean; startUpdate(): Promise<void>; snooze(): Promise<void>; checkNow(): Promise<'none' | 'optional' | 'force' | 'failed'> }`.
  - **On mount:**
    1. Load the settings.
    2. If `update.lastBuild` is set and lower than the current build, log `update.installed {from, to}`, delete `Paths.cache/update/` (best effort), and clear `forceMinBuild` if the current build is at or above it.
    3. Save `lastBuild = current`.
    4. Run an automatic check if `shouldCheck` allows it.
  - **Foreground:** run the automatic check again, subject to the same rule.
  - **A check:**
    1. `configUrl` empty → `none`, and no fetch happens.
    2. Otherwise fetch, then `parseUpdateConfig`, `decideUpdate` and `effectiveDecision`.
    3. Persist: `lastCheckedAt` always. On `force`, set `forceMinBuild = target.minBuild`. On a fresh `none` or `optional`, clear `forceMinBuild`.
    4. Log `update.available` when the result is not `none`, and `update.checkFailed` (warn) on a failure.
    5. A snoozed `optional` → `none`.
  - **`startUpdate`:**
    1. If `fromMemory` is set, re-check first. If that check still fails, show `t.update.checkFailed`.
    2. Log `update.started`.
    3. Android: `installApk(target)`. iOS: `openUrl(target.url)`.
    4. Errors go to `showError` and are logged as `update.failed {code}`. `busy` stays true while downloading.
- **`UpdateGate`** renders `children` plus:
  - **`force`:** an absolute full-screen overlay (themed) with the title, message (`config.message[language]` or else `t.update.forceBody`), the current version line and the Update button. While busy it shows a spinner and `t.update.downloading(size MB)`. Before the first Android install it shows `t.update.installHint` once. A `BackHandler` listener returns `true`.
  - **`optional`:** one Alert per check result with `optionalTitle`/`optionalBody` and `[later → snooze, updateNow → startUpdate]`.
- **Settings:** a line `t.settings.version(version, build)` and a row `t.settings.checkUpdate`. The row calls `checkNow`:
  - `none` → `Alert(t.update.upToDate)`;
  - `failed` → `Alert(t.update.checkFailed)`;
  - `optional`/`force` → the gate handles it.

  Settings needs the hook's `checkNow`. Expose it through a small context (`UpdateProvider`) rather than running a second check instance.

- [ ] **Step 1: write the failing tests** (all deps injected or mocked; use the memory fs for settings).
  - `useUpdateCheck`:
    - mount with `{min 8, latest 8}` and build 7 → `force`, with `forceMinBuild: 8` saved;
    - **Review Focus 1:** remount with the fetch failing → still `force` with `fromMemory`;
    - a later fetch with `{min 7, latest 8}` → `optional`, with `forceMinBuild` cleared;
    - a 30-minute throttle on foreground;
    - an empty `configUrl` → no fetch and `none`;
    - an invalid config → `none` plus a warn;
    - **Review Focus 5:** stored `lastBuild` 7 with current 8 → `update.installed {from:7, to:8}` is logged and the cache is cleanup-called;
    - snooze persists and suppresses the same `latestBuild` for 24 h.
  - `UpdateGate`:
    - `force` renders the overlay with exact vi copy, and en copy under an `en` LocaleProvider;
    - **Review Focus 4:** a `BackHandler` `hardwareBackPress` returns `true`;
    - Update calls `installApk` on Android (`Platform.OS` replaced) and `openUrl` on iOS;
    - **Review Focus 3:** `installApk` rejecting with `UpdateCorruptError` shows the UPDATE_CORRUPT popup, keeps the overlay, and leaves the button enabled again;
    - `optional` shows an Alert, and its Later button persists the snooze;
    - the busy state shows `downloading` with MB.
  - **Settings:** the version line is shown, and Check for updates gives up to date, failed, and a found update (the gate shows).
  - **Layout:** the gate is mounted, so a mocked `force` overlays the Stack.
- [ ] **Step 2:** run the tests → FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** run the tests → PASS; then `npm test` (including both guards) and `npm run typecheck`.
- [ ] **Step 5:** commit — `feat: force/optional update gate with in-app APK install`.

### Task 5: Release process docs and device verification (controller)

**Files:**
- Modify: `README.md` (1.7.0 feature line; a "Phát hành bản mới / Force update" section covering spec §3, the keystore creation command, backup advice and the one-time uninstall; checklist items)
- Create: `docs/superpowers/progress/2026-10-07-force-update.md`

- [ ] **Step 1:** the README release process, verified against the actual commands.
- [ ] **Step 2: device loop.** This needs user consent for the external setup: a public Gist and a public APK URL. It also needs a keystore, which the user creates with the README command.
  1. Prebuild and build a signed 1.7.0 (build 7). Uninstall the debug-signed app, then install it.
  2. Build a signed build 8, host it publicly, and point the Gist at it with `minBuild 8`.
  3. Verify the block, the download, the MD5 check, the installer, and that build 8 runs and logs `update.installed`.
  4. Verify the optional prompt.

  If the user declines the external setup, verify instead with `extra.updateConfigUrl` empty, so the app works and does no check. In that case the full loop is left to the user's checklist.
- [ ] **Step 3:** write the progress log, run `npm test` and `npm run typecheck`, then commit — `docs: force update release process and progress log`.
