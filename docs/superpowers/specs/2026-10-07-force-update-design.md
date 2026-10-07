# iScanner — Force Update — Design Spec

- **Date:** 2026-10-07
- **Source:** requirement "07/10/2026 - sequence 2", part 5 of 5: "review và implement tính năng force update version mới".
- **Builds on:**
  - part 2: i18n (`useLocale`), and the settings storage `src/settings/settings.ts`;
  - part 3: `AppError` and `showError`;
  - part 4: `log`.
- **Status:** approved in chat; awaiting written-spec review.

## 1. Goal and decisions

When a newer build is published, iScanner tells the user and, below a minimum build, blocks the app until it is updated.

- On Android the app downloads, verifies and opens the APK installer itself.
- On iOS (sideloaded IPA) it opens an update page.

| Topic | Decision |
|---|---|
| Version source | A public GitHub Gist JSON (§2.1), read through its raw URL. The URL lives in `app.json` → `expo.extra.updateConfigUrl`, so it can change without code changes. The repo stays private. |
| Comparison | By native build number: Android `versionCode`, iOS `buildNumber` (from `expo-application`). It is never done by the version string. |
| Outcomes | `force` (current < `minBuild`) shows a full-screen block. `optional` (current < `latestBuild`) shows a dismissible prompt. `none` lets the app run normally. |
| Failure policy | No network, a timeout (5 s), an HTTP error or an invalid config gives `none` plus `log.warn('update.checkFailed')`. **Exception:** a remembered `force` (§2.4) still blocks while the installed build is below it, so the block cannot be bypassed by going offline. |
| Android update | Download into the cache (`File.downloadFileAsync`), verify `md5` (native `File.md5`, compared with the Gist), then open the system installer (`expo-intent-launcher` `VIEW` with `File.contentUri`, `application/vnd.android.package-archive`, read grant). This needs the manifest permission `REQUEST_INSTALL_PACKAGES`. Android itself refuses an APK signed with a different key. |
| iOS update | `Linking.openURL(config.ios.url)`, the page with sideload instructions. |
| Signing | A private release keystore, wired by a repo config plugin from Gradle properties kept outside the repo (§2.6). Devices that have the current debug-signed build must uninstall once and install the first release-signed build. After that they update in place. |
| APK size | Document an arm64-only release build (`-PreactNativeArchitectures=arm64-v8a`) for distribution. The default build config is unchanged. |
| Version | 1.7.0, versionCode 7, iOS buildNumber "7". |

Out of scope:
- Store in-app-update APIs (Play In-App Updates, App Store);
- OTA JS updates (`expo-updates`);
- download progress percentage (the SDK 57 download API has no progress);
- delta updates.

## 2. Modules

### 2.1 Config format and `src/update/config.ts` (pure)

```json
{
  "android": { "minBuild": 7, "latestBuild": 8, "url": "https://…/iScanner-1.7.1-arm64.apk", "md5": "0123…", "size": 88000000 },
  "ios":     { "minBuild": 7, "latestBuild": 8, "url": "https://…/update-ios" },
  "message": { "vi": "…", "en": "…" }
}
```

```ts
export type PlatformUpdate = { minBuild: number; latestBuild: number; url: string; md5?: string; size?: number };
export type UpdateConfig = { android?: PlatformUpdate; ios?: PlatformUpdate; message?: { vi?: string; en?: string } };
export function parseUpdateConfig(json: unknown): UpdateConfig | null;
```

`parseUpdateConfig` rules:

- Builds must be integers ≥ 1, and `latestBuild ≥ minBuild`.
- `url` must use the `https:` scheme.
- `android.md5` is required: 32 hex characters, compared case-insensitively.
- `size` is optional and must be a positive integer.
- `message` strings are capped at 300 characters.
- A platform block that fails validation is dropped. If both are dropped, the result is `null`.

### 2.2 `src/update/decide.ts` (pure)

- `decideUpdate(config: UpdateConfig | null, platform: 'android' | 'ios', currentBuild: number)` returns `{ kind: 'force' | 'optional' | 'none'; target?: PlatformUpdate }`. A missing platform block or a null config gives `none`.
- `shouldCheck(lastCheckedAt: number | null, now: number, minIntervalMs = 30 * 60_000): boolean`
- `isSnoozed(snooze: { build: number; until: number } | null, latestBuild: number, now: number): boolean`. A snooze lasts 24 h and applies only to the same `latestBuild`.
- `effectiveDecision(fresh, remembered: { minBuild: number } | null, currentBuild)` keeps a `force` when the fresh check failed and `currentBuild < remembered.minBuild`.

### 2.3 `src/native/updateConfigFetch.ts`

- `fetchUpdateConfig(url, { timeoutMs = 5000, fetchImpl = fetch })` calls `GET ${url}?t=${Date.now()}` with `Cache-Control: no-cache` and an `AbortController` timeout.
- A non-2xx status, a JSON error or an abort throws. The caller maps any throw to "check failed".

### 2.4 Persisted update state (settings file)

`Settings` gains `update?: { lastCheckedAt?: number; forceMinBuild?: number; snooze?: { build: number; until: number }; lastBuild?: number }`.

- It is saved through `saveSettings({ update: … })`, a serialized merge from part 2.
- `parseSettings` must keep the existing theme and language behaviour and validate this block.
- An invalid block becomes `undefined`.

`lastBuild` detects a successful update on the next start, which triggers `log.info('update.installed', {from, to})` and deletes `cache/update/`.

### 2.5 `src/native/apkInstaller.ts` (Android only)

```ts
export async function downloadAndInstallApk(target: PlatformUpdate, deps?): Promise<void>;
```

1. Delete `Paths.cache/update/`, recreate it, then `File.downloadFileAsync(target.url, new File(dir, \`iScanner-${target.latestBuild}.apk\`))`. A failure throws `UpdateDownloadError({ cause })`.
2. Compare `file.md5.toLowerCase()` with `target.md5.toLowerCase()`. On a mismatch, delete the file and throw `UpdateCorruptError()`.
3. Call `IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: file.contentUri, type: 'application/vnd.android.package-archive', flags: 1 /* GRANT_READ_URI */ | 0x10000000 /* NEW_TASK */ })`. A failure throws `UpdateInstallError({ cause })`.

When "install unknown apps" is not yet allowed for iScanner, Android's installer shows its own prompt with a Settings link. The app shows a short hint before opening the installer the first time.

New `AppError` subclasses and codes:

| Class | Code |
|---|---|
| `UpdateDownloadError` | `UPDATE_DOWNLOAD` |
| `UpdateCorruptError` | `UPDATE_CORRUPT` |
| `UpdateInstallError` | `UPDATE_INSTALL` |

Each has vi/en copy in `t.errors` and is shown through `showError`.

### 2.6 Release signing: `plugins/withReleaseSigning.js`

- A config plugin (`withAppBuildGradle`) adds this to `android/app/build.gradle`:

  ```groovy
  signingConfigs { release { if (project.hasProperty('ISCANNER_UPLOAD_STORE_FILE')) { storeFile file(ISCANNER_UPLOAD_STORE_FILE); storePassword ISCANNER_UPLOAD_STORE_PASSWORD; keyAlias ISCANNER_UPLOAD_KEY_ALIAS; keyPassword ISCANNER_UPLOAD_KEY_PASSWORD } } }
  ```

- It also makes `buildTypes.release.signingConfig` use `signingConfigs.release` when the property exists, and keep the current debug config otherwise. Gradle prints a warning `iScanner: release build is signed with the DEBUG key`.
- The change is idempotent: running prebuild twice must not duplicate the block.
- The properties live in `~/.gradle/gradle.properties`. No secrets go in the repo.
- `app.json` registers the plugin, and `android.permissions` gains `REQUEST_INSTALL_PACKAGES`.

### 2.7 Hook and UI

- **`src/update/useUpdateCheck.ts`** (used in `app/_layout.tsx` inside the providers):
  - **When it runs:** on mount and on every return to the foreground (`useForegroundCheck`), subject to `shouldCheck`.
  - **Check:** fetch, then `parseUpdateConfig`, then `decideUpdate`, then `effectiveDecision`, then persist (`lastCheckedAt`; `forceMinBuild` on `force`, cleared once current ≥ it).
  - **Returns:** `{ decision, startUpdate(), snooze(), checkNow() }`.
  - **Logs:** `update.available {kind, from, to}`, `update.checkFailed` (warn), `update.started`, `update.failed {code}`.
- **`src/components/UpdateGate.tsx`:**
  - **`force`:** an absolute full-screen overlay above the Stack, with an Android `BackHandler` that consumes back. It shows:
    - the title `t.update.forceTitle`;
    - the message, from `config.message[language]` or else `t.update.forceBody`;
    - the line `t.update.current(version, build)`;
    - the button `t.update.updateNow`.

    While downloading, the button shows a spinner and `t.update.downloading(sizeMB?)`, and a `t.common.cancel` option discards the result.
  - **`optional`:** an Alert-style prompt with `t.update.optionalTitle` / body, plus `t.update.updateNow` and `t.update.later` (`later` calls `snooze`).
  - **iOS:** `startUpdate` calls `Linking.openURL(target.url)`.
- **Settings screen**, in the `Hỗ trợ` group:
  - a non-pressable line `t.settings.version(version, build)`;
  - a row `t.settings.checkUpdate`. It calls `checkNow` (ignoring the 30-minute limit). If the result is `none`, it shows `t.update.upToDate`; a failure shows `t.update.checkFailed`.
- **Copy** (both tables):

| Key | vi | en |
|---|---|---|
| `update.forceTitle` | Cần cập nhật iScanner | Update required |
| `update.forceBody` | Phiên bản này đã cũ. Vui lòng cập nhật để tiếp tục sử dụng. | This version is no longer supported. Please update to continue. |
| `update.optionalTitle` | Đã có phiên bản mới | A new version is available |
| `update.optionalBody` | Cập nhật để có các tính năng và bản sửa lỗi mới nhất. | Update to get the latest features and fixes. |
| `update.updateNow` | Cập nhật | Update |
| `update.later` | Để sau | Later |
| `update.downloading(mb)` | Đang tải bản cập nhật… (≈ N MB) | Downloading update… (≈ N MB) |
| `update.installHint` | Nếu Android hỏi, hãy cho phép iScanner cài ứng dụng rồi bấm Cập nhật lại. | If Android asks, allow iScanner to install apps, then tap Update again. |
| `update.current(v,b)` | Phiên bản hiện tại: v (b) | Current version: v (b) |
| `update.upToDate` | Bạn đang dùng phiên bản mới nhất. | You're on the latest version. |
| `update.checkFailed` | Không kiểm tra được cập nhật. Vui lòng thử lại khi có mạng. | Couldn't check for updates. Please try again when online. |
| `settings.version(v,b)` | Phiên bản v (b) | Version v (b) |
| `settings.checkUpdate` | Kiểm tra cập nhật | Check for updates |

When `size` is missing, `update.downloading` is shown without the size.

The copy for the three new error codes:

| Code | Language | Title | Message |
|---|---|---|---|
| `UPDATE_DOWNLOAD` | vi | Không tải được bản cập nhật | Kiểm tra kết nối mạng rồi thử lại. |
| `UPDATE_DOWNLOAD` | en | Couldn't download the update | Check your connection and try again. |
| `UPDATE_CORRUPT` | vi | File cập nhật bị lỗi | File tải về không khớp, vui lòng thử lại. |
| `UPDATE_CORRUPT` | en | Update file is damaged | The downloaded file didn't match. Please try again. |
| `UPDATE_INSTALL` | vi | Không mở được trình cài đặt | Hãy cho phép iScanner cài ứng dụng trong Cài đặt rồi thử lại. |
| `UPDATE_INSTALL` | en | Couldn't open the installer | Allow iScanner to install apps in Settings, then try again. |

## 3. Release process (README)

1. Bump `version`, `android.versionCode` and `ios.buildNumber`.
2. Build a signed release: `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`.
3. Compute the MD5: `certutil -hashfile app-release.apk MD5`.
4. Upload the APK to a public HTTPS location.
5. Edit the Gist: set `latestBuild`, `url`, `md5` and `size`, and raise `minBuild` to force the update.
6. For iOS: build the IPA as today, then update `ios.latestBuild`, `ios.minBuild` and the instruction page.

The README also covers creating the keystore (a `keytool -genkeypair …` command), backing it up, and the one-time uninstall for existing debug-signed installs.

## 4. Edge cases

| Situation | Behaviour |
|---|---|
| Offline at first launch, no remembered force | `none`; the app works. |
| Offline, remembered `forceMinBuild` > current | Blocked. |
| Gist edited to lower `minBuild` | The next successful check clears the remembered force. |
| Invalid Gist JSON, or a non-https URL | `none` plus `warn`; never blocks. |
| APK MD5 mismatch | `UPDATE_CORRUPT` popup; the file is deleted. |
| User cancels the system installer | The block stays (force) and Update can be tapped again. |
| APK signed with another key | Android's installer reports a conflict, so the app cannot be replaced by a foreign APK. |
| Share received while blocked | The block overlays the incoming screen. The share is kept natively and handled after the update (accepted). |
| iOS, force | The block plus a button that opens the instruction URL. |

## 5. Testing

- **Unit:**
  - `parseUpdateConfig`: valid input; each invalid field; a non-https URL; a missing md5; a bad md5; `latest < min`; message truncation;
  - `decideUpdate`: boundaries (current = min − 1, min, latest − 1, latest);
  - `shouldCheck`, `isSnoozed`, `effectiveDecision` (remembered force while offline; clearing it);
  - the `parseSettings` `update` block;
  - `fetchUpdateConfig`: timeout, HTTP 500, invalid JSON, cache-buster;
  - the new error classes and their copy.
- **`apkInstaller`** (fs, download and intent mocked):
  - success opens an intent with the exact action, type and flags;
  - an MD5 mismatch deletes the file and gives `UpdateCorruptError`;
  - a download throw gives `UpdateDownloadError`;
  - an intent throw gives `UpdateInstallError`;
  - the old `update/` folder is cleared.
- **Plugin:** applying it to a sample `build.gradle` adds `signingConfigs.release` once (idempotent) and points the release `buildType` at it conditionally.
- **Screens:**
  - layout + `UpdateGate`:
    - `force` renders the block, back is consumed, and Update calls the installer (Android) or `openURL` (iOS);
    - `optional` shows the prompt, and Later persists the snooze;
    - an offline remembered force blocks;
  - Settings: the version line and Check for updates (up to date / failed / update found);
  - vi and en.
- **Device (Android emulator), with the user's consent for the external setup (a public Gist and a public APK URL):**
  1. Generate the release keystore, uninstall the debug-signed app, and install a signed 1.7.0 (build 7).
  2. Publish a signed build 8 APK and a Gist with `minBuild 8`.
  3. Relaunch: the block appears; Update downloads, the MD5 matches and the installer opens; after installing, the app reports build 8 and logs `update.installed`.
  4. Set `minBuild 7` and `latestBuild 9`: the optional prompt appears, and Later snoozes it.

## 6. Success criteria

1. Below `minBuild` the app is unusable except for updating, even offline after one successful check. Below `latestBuild` the user is prompted, and the prompt can be dismissed.
2. Android downloads, verifies (MD5) and hands the APK to the system installer. Only APKs signed with the release key can replace the app.
3. Network or config failures never block a user who has not been told to update.
4. Release signing secrets never enter the repo, and the release process is documented.
5. All tests and typecheck pass, and the full update loop is verified on the emulator.
