# Progress — Force update (07/10/2026 sequence 2, part 5 of 5)

- Spec: `docs/superpowers/specs/2026-10-07-force-update-design.md`
- Plan: `docs/superpowers/plans/2026-10-07-force-update.md`. 5 tasks, run subagent-driven: Sonnet implementers and reviewers, with Opus reviewing Task 4 and the whole branch. The work was paused once at the user's request (2026-10-07) and resumed on 2026-10-09.
- Branch: `feat/force-update`, from master `4766b0e`. Version 1.7.0, versionCode 7, iOS buildNumber "7".
- This completes all 5 parts of requirement 07/10 seq 2: audit, i18n, typed errors, logging and force update.

## What was built
- **`src/update/config.ts`** has `parseUpdateConfig`:
  - builds must be integers ≥ 1, with `latest ≥ min`;
  - URLs must be https only;
  - Android requires an md5 of 32 hex characters (case-insensitive);
  - `size` is optional and must be a positive integer;
  - messages are capped at 300 characters;
  - an invalid platform block is dropped.
- **`src/update/decide.ts`**:
  - `decideUpdate`: force if below `minBuild`, optional if below `latestBuild`, otherwise none;
  - `shouldCheck`: at most one check per 30 minutes;
  - `isSnoozed`: snoozes last 24 hours, for the same `latestBuild` only;
  - `effectiveDecision`: a remembered force still blocks when the check fails.
- **Settings:** a validated `update` block (`lastCheckedAt`, `forceMinBuild`, `snooze`, `lastBuild`). The new `saveUpdateState(patch)` runs on the same serialized queue as other saves and merges into `update`; setting a key to `undefined` clears it.
- **Errors:** `UpdateDownloadError`, `UpdateCorruptError` and `UpdateInstallError` (`UPDATE_DOWNLOAD/CORRUPT/INSTALL`), each with vi/en copy. All `update.*` copy matches spec §2.7.
- **`src/native/updateConfigFetch.ts`:** 5 s `AbortController` timeout, `?t=`/`&t=` cache-buster, `Cache-Control: no-cache`.
- **`src/native/apkInstaller.ts`** downloads the APK and hands it to the system installer:
  1. Downloads to `cache/update/iScanner-<latestBuild>-<runId>.apk` with `File.downloadFileAsync`. Other stale `.apk` files are deleted best-effort.
  2. Checks the native `File.md5` against the Gist. On a mismatch it deletes the file and raises `UpdateCorruptError`.
  3. Checks for cancellation, then calls `IntentLauncher.startActivityAsync(VIEW, { data: contentUri, type: apk, flags: 0x10000001 })`.

  `openUpdatePage` is used on iOS. **`src/native/appBuild.ts`** reads `expo-application` version and build.
- **`plugins/withReleaseSigning.js`:** an idempotent Gradle patch that adds `signingConfigs.release` from the `ISCANNER_UPLOAD_*` properties. The release build type uses it only when those properties exist; otherwise it signs with the debug key and prints the warning `iScanner: release build is signed with the DEBUG key`. If the expected anchors are missing, it fails loudly.
- **`app.json`:** registers the plugin, adds `android.permissions: [REQUEST_INSTALL_PACKAGES]` and `extra.updateConfigUrl: ""` (empty means no check), and sets 1.7.0/7/"7".
- **`src/update/useUpdateCheck.ts`** and **`UpdateContext`** run one check instance for the whole app.
  - **On mount:** detects a successful update, logging `update.installed` and clearing the cache and any remembered force. It saves `lastBuild`, then applies a remembered force immediately.
  - **When checks run:** on mount and when the app returns to the foreground, throttled to one per 30 minutes. Concurrent checks share a single in-flight promise.
  - **Treated as a failed check:** an invalid config, or a config with no block for this platform. The remembered force stays.
  - **Manual `checkNow`:** returns `'failed'` when no config URL is set.
  - **`startUpdate`:**
    - re-checks if the force came from memory;
    - waits for a cancelled previous run, up to 15 s;
    - Android: downloads and installs; iOS: opens the update page;
    - errors go through `showError` and are logged as `update.failed {code}`.
  - **`cancel()`:** discards the in-flight result.
- **`src/components/UpdateGate.tsx`:**
  - **Force:** an opaque full-screen overlay above the Stack, so it also covers Incoming and Settings. Back is consumed. App content is hidden from accessibility services (`importantForAccessibility="no-hide-descendants"`, `accessibilityElementsHidden`). It shows the title, message, current version and an Update button; while downloading it shows a spinner, the MB size and Cancel. A one-time install hint is shown.
  - **Optional:** an Alert with Later (snooze) and Update. During the download a non-blocking bottom banner with `pointerEvents="box-none"` offers Cancel.
- **Settings → Hỗ trợ:** shows `Phiên bản 1.7.0 (7)` and a `Kiểm tra cập nhật` row.
- **README:** a "Phát hành bản mới / Force update" section covering keystore creation with `keytool`, the absolute path in `~/.gradle/gradle.properties`, backups, the debug-key warning, the one-time uninstall, the Gist format, and release steps (arm64 build, `certutil` MD5, Gist edits). It also has 1.7.0 checklist items.
- **Tests:** 695 across 68 suites. Typecheck is clean.

## Commits
234fef1 spec, 065e7f6 plan, 7b4124c (T1), 47d7b01 (T2), b4c2759 (T3), eba7f13 + 2ca8dda + bb01d51 (T4 plus 2 fix rounds), 97f5690 (final-review fix wave), then docs.

## Rulings
- **T1:** `saveSettings` replaces the whole `update` object. Task 4 therefore added a serialized `saveUpdateState` that merges inside `update`, and all update-state writes go through it.
- **T4: invalid config.** It counts as a failed check and keeps a remembered force. This is the safer reading of spec §4 and fits the global constraint.
- **T4: Cancel while downloading.** Spec §2.7 required it even though the brief left it out, so it was added.
- **T4: test console noise.** It was removed from the hook tests.
- **T5:** done by the controller.
- **Final review: Minor findings raised to required.**
  - Check-now with no URL now says "couldn't check" instead of "up to date".
  - A config with no block for this platform counts as a failed check.
  - The wait for a stalled cancelled download is capped at 15 s, and each run uses its own file name.
- **Final review Important: TalkBack could bypass the block.** App content is now hidden from accessibility services while forced.
- **Device check (user's choice):** a light check only. The full download-and-install loop needs a release keystore, a public Gist and a public APK URL, which the user will set up later.

## Device verification (release APK, emulator, 2026-10-09): light check passed
- `expo prebuild --clean` applied the signing plugin (conditional `signingConfig` plus marker) and the manifest permission.
- With no keystore, Gradle printed `iScanner: release build is signed with the DEBUG key`, as designed.
- The first `assembleRelease` failed with exit 4551 after Metro had finished writing the bundle, probably due to memory pressure. A rerun with `--max-workers=2` succeeded.
- The installed app reports `versionCode=7`, `versionName=1.7.0`, and has `REQUEST_INSTALL_PACKAGES`.
- The app opens normally with no block (`updateConfigUrl` is empty).
- Settings shows `HỖ TRỢ` → `Gửi log lỗi`, `Kiểm tra cập nhật`, and `Phiên bản 1.7.0 (7)`. Check for updates shows "Không kiểm tra được cập nhật. Vui lòng thử lại khi có mạng."
- **Not done (needs the user's external setup):**
  - the block, download, MD5, installer and installed-build loop;
  - the optional prompt and snooze on a device;
  - iOS.

  These are in the README checklist.

## Deferred minors
- **T1:** an iOS block is dropped when its md5 is malformed (kept, matches the spec); the snooze cast is awkward; import order.
- **T2:** gaps in the null-md5, missing-dir and timeout tests.
- **T3:** the release `signingConfig` search is not bounded to its block; the debug config is assumed to have no nested braces; one throw test has no message matcher.
- **T4:**
  - a startup race can let a stale remembered force override a fresh check;
  - a manual check can receive a snoozed automatic result;
  - React Native modals sit above the overlay;
  - the optional prompt can repeat during a from-memory start;
  - the banner has no bottom safe-area inset;
  - double quotes in `UpdateGate.tsx`;
  - the existing VirtualizedList `act()` noise remains.
- **Final review:**
  - the MD5 is computed synchronously;
  - an APK can be left in the cache after a failed or declined install;
  - test gaps: Settings "update found", a share covered by the block, and `update.available` logging `to: undefined` for a remembered force;
  - a late cancelled run's APK lingers in the cache;
  - after the 15 s cap, the old download can still use bandwidth.
- **Recommendation:** once the keystore exists, make `assembleRelease` fail without it rather than only warn.

## Open
- The user creates the release keystore (README), uninstalls the debug-signed build once, publishes a public Gist and a public APK URL, then runs the full loop from the checklist.
- iPhone test.
