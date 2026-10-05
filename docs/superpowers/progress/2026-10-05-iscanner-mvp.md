# iScanner MVP — Progress Log

Durable record of plan execution, for resuming in later sessions.

- **Plan:** `docs/superpowers/plans/2026-10-05-iscanner-mvp.md`
- **Spec:** `docs/superpowers/specs/2026-10-05-camscanner-mvp-design.md`
- **Branch:** `feat/iscanner-mvp` (from `master` @ `3973cf2`) — merged into `master` (fast-forward @ `4cfade1`) on 2026-10-05 and the branch deleted
- **Execution method:** superpowers:subagent-driven-development (user's choice)
- **Resume rule:** tasks marked ✅ are done — do not redo them; continue at the first task not marked ✅. Trust `git log` over memory.

## Decisions (rulings made during execution)

- R1: Task 8 also creates `src/components/NameInput.tsx` (plan's Files list omitted it).
- R2: `LibraryStore.remove(id)` with an unknown id is a no-op.
- R3: Task 10 passes a thunk to `busy.run(() => createMergedDocument(...))`.
- R4: Task 11 `expo export` writes to a scratch dir outside the repo.
- R5: Routes live in root `app/` (not `src/app/`). AGENTS.md was rewritten in the final fix wave.
- R6: The camera-permission error message is localized → the generic scan-error alert also offers `Mở Cài đặt` (no expo-camera added).
- R7: Added `expo-dev-client` + `eas.json` (development/preview/production) and EAS/Apple account steps in the README.
- R8: Long-press menu: iOS uses `ActionSheetIOS`, Android uses a custom Modal (`src/components/DocumentActions.tsx`).
- R9: Scanned images and picked PDF copies are deleted after use (`src/native/deleteFiles.ts`).
- R10: Not fixed yet (known issues): navigating away while busy; memory limits for very large scans (README note only); A4 page scaling (needs a spec change; pages currently match the image pixel size); web template leftovers (README notes Android/iOS only).
- Parked: deleting files while a create/merge is still running (if the user leaves the screen or taps Xoá mid-run, it fails with no data loss; fix together with "navigating while busy"); cache copies still loading at unmount are not deleted.

## Tasks

| # | Task | Status | Commits | Notes |
|---|---|---|---|---|
| 1 | Scaffold Expo project | ✅ done | `1e1029a` | review clean |
| 2 | Format & name helpers | ✅ done | `7657898` | review clean |
| 3 | PDF create & merge | ✅ done | `2fd0fc2` | review clean |
| 4 | Library store | ✅ done | `a116414`, `4fca531` | 1 fix round (atomic writes) |
| 5 | Ordered list & busy hooks | ✅ done | `5f03d35` | review clean |
| 6 | Scan & merge workflows | ✅ done | `9f4c91c` | review clean |
| 7 | Library context & native wrappers | ✅ done | `23fad3b` | review clean |
| 8 | Root layout & Home screen | ✅ done | `64aacd9` | review clean |
| 9 | Scan review screen | ✅ done | `01a1e98` | review clean |
| 10 | Merge PDFs screen | ✅ done | `8df0e86` | review clean |
| 11 | Viewer & final verification | ✅ done | `9a2c701` | review clean |

## Task details

<!-- One section per completed task: what was built, key files, versions/facts later work needs, deferred minor findings. -->

### Task 1 — Scaffold (✅ `1e1029a`)
- Template `blank-typescript` copied to repo root; `App.tsx`/`index.ts` removed; `main: expo-router/entry`; scripts `npm test`, `npm run typecheck`.
- Versions: expo ~57.0.26, react-native 0.86.3, reanimated 4.5.1 + react-native-worklets 0.10.1, draggable-flatlist ^4.0.3, jest ~29.7, jest-expo ~57.0.5, @testing-library/react-native ^14.0.1, TypeScript ~6.0.3, pdf-lib ^1.17.1.
- Gotchas: `react-dom@19.2.3` was installed explicitly to fix an npm ERESOLVE. `tsconfig.json` has `"types": ["jest","node"]`, because TS 6 no longer auto-includes @types, so add new ambient types there. `npx expo install … -- --save-dev` misplaces packages; check devDependencies afterwards.
- Verification: jest 1/1, typecheck clean, expo-doctor 21/21.
- Deferred minors: `@types/node` is not a direct devDependency; the template `AGENTS.md` is misleading (src/app, bun).

### Task 2 — Format helpers (✅ `7657898`)
- `src/utils/format.ts` provides four helpers:
  - `formatDate(iso)` → `dd/MM/yyyy HH:mm`
  - `defaultName('scan'|'merge', date)` → `Scan|Gộp dd-MM-yyyy HH.mm`
  - `formatSize(bytes)` → `B/KB/MB` (1024 base, 1 decimal)
  - `sanitizeName(input, fallback)` (trim, fallback, max 100)
- Tests: `__tests__/utils/format.test.ts` (9 tests, local-time dates).
- Deferred minors: the date padding code is duplicated; truncation may split emoji surrogate pairs; an invalid ISO string gives `NaN`; tests cover only happy paths.

### Task 3 — PDF create & merge (✅ `2fd0fc2`)
- `src/pdf/images.ts`:
  - types `ImageMime`, `ImageInput`
  - `detectImageType(bytes)` (magic bytes; throws `UNSUPPORTED_IMAGE`)
- `src/pdf/createPdfFromImages.ts`: `createPdfFromImages(images)` creates one page per image, sized to the image's pixels. Throws `NO_IMAGES` on an empty list.
- `src/pdf/mergePdfs.ts`:
  - `PdfLoadError` (has `.index`, message `PDF_LOAD_FAILED`)
  - `getPdfPageCount(pdf)`
  - `mergePdfs(pdfs)` (throws `NO_PDFS`; encrypted or corrupt input → `PdfLoadError` with the input index)
- Test fixtures: `__tests__/fixtures/images.ts` provides `makePng(w,h)` and `makeJpeg(w,h)`.
- Tests: 9 pdf tests; full suite 19/19.
- Deferred minors: `PdfLoadError` drops the original cause; the encrypted-PDF test uses a mock, not a real encrypted file.

### Task 4 — Library store (✅ `a116414`, fix `4fca531`)
- `src/library/types.ts` defines:
  - `DocumentSource`
  - `DocumentMeta` (`id`, `name`, `fileName`, `createdAt`, `pageCount`, `sizeBytes`, `source`)
  - `FsAdapter` (`readText` / `writeText` / `writeBytes` / `readBytes` / `delete` / `ensureDir` / `uri`)
  - `LibraryStore`
- `src/library/libraryStore.ts`: `createLibraryStore({ fs, now?, newId? })`.
  - Files are stored at `pdfs/<id>.pdf`, with the index at `library.json` `{version:1, documents}`.
  - A corrupt index or one with the wrong version is backed up to `library.json.bak` and the library starts empty.
  - `add` writes the PDF first, then the index, and deletes the PDF if the index write fails.
  - `remove` writes the index first, then deletes the file. An unknown id is a no-op.
  - `rename` throws `NOT_FOUND` for an unknown id; an empty name keeps the current name.
- `src/library/memoryFs.ts`: `createMemoryFs()` with `.files` (Map) and `failNextWrite(path)`, for tests.
- `src/library/expoFs.ts`: SDK 57 `File`/`Directory`/`Paths.document`. Writes go to `<path>.tmp`, then `moveSync(target, {overwrite:true})`. Not unit-tested.
- Tests: libraryStore 9/9; full suite 28/28.
- Deferred minors:
  - If the backup write fails, `list()` throws.
  - Operations that read and then write the index are not serialised.
  - Index entries are not validated.
  - On iOS, move-with-overwrite has a small non-atomic window.

### Task 5 — Hooks (✅ `5f03d35`)
- `src/workflows/useOrderedList.ts` exports `Keyed<T> = {key, value}` and `useOrderedList<T>()`, which returns `{ items, append(values), remove(key), setOrder(items) }`. Keys come from a counter, so duplicate values get distinct keys.
- `src/workflows/useBusy.ts`: `useBusy()` returns `{ busy, run(fn) }`.
  - A synchronous ref guard makes a second call during an in-flight run return `undefined` without calling `fn`.
  - Rejections are rethrown after busy is reset.
- Testing note: in RNTL v14, `renderHook`, `render` and `act` are async, so always `await` them.
- Tests: 5 new; full suite 33/33.

### Task 6 — Workflows (✅ `9f4c91c`)
- `src/workflows/scanWorkflow.ts`:
  - `type ReadBytes = (uri) => Promise<Uint8Array>`
  - `createScanDocument({readBytes, library}, imageUris, name)` uses `detectImageType` per image, then `createPdfFromImages`, then `library.add` with `{pageCount: uris.length, source:'scan'}`. An empty list throws `NO_IMAGES`.
- `src/workflows/mergeWorkflow.ts`:
  - types `PickedPdf {uri,name}` and `LoadedPdf {uri,name,pageCount}`
  - `loadPickedPdfs({readBytes}, files)` returns `{loaded, failed: string[]}`. Bad files go to `failed` and the function never throws for them.
  - `createMergedDocument({readBytes, library}, files, name)` adds the result with `pageCount` = sum and `source:'merge'`.
- Tests: 6 new; full suite 39/39.

### Task 7 — Context & native wrappers (✅ `23fad3b`)
- `src/library/LibraryContext.tsx`:
  - `LibraryProvider({store?, children})` creates the default store lazily with `expoFs`.
  - `useLibrary()` returns `{documents, loading, store, refresh, rename, remove}` and throws when used outside a provider.
- Native wrappers:
  - `src/scanner/scanner.ts`: `scanDocuments()` returns `string[]` (`[]` on cancel). Permission errors become `Error('CAMERA_PERMISSION')`.
  - `src/native/pickPdfs.ts`: `pickPdfs()` returns `PickedPdf[]`.
  - `src/native/share.ts`: `shareDocument(uri)`.
  - `src/native/readBytes.ts`: `readBytes` via `new File(uri).bytes()`.
- Testing note: mock `react-native-document-scanner-plugin` with a factory (`jest.mock(path, () => ({...}))`). A bare automock loads the real module, which throws.
- Manual check needed on device: the scanner's permission-denied message matches `/permission/i`.
- Tests: full suite 46/46.
- Deferred minors: the context load has no `.catch`; `pickPdfs` and `share` are untested.

### Task 8 — Layout & Home (✅ `64aacd9`)
- `app/_layout.tsx` nests `GestureHandlerRootView` > `LibraryProvider` > `Stack`, with routes `index` (iScanner), `scan`, `merge` and `viewer/[id]`.
- `app/index.tsx` is the library list with an empty state, the buttons `Scan tài liệu`/`Gộp PDF`, tap to open the viewer, and long-press for Đổi tên / Chia sẻ / Xoá. Rename uses a Modal. Errors show `Alert 'Có lỗi xảy ra'`.
- Components:
  - `src/components/DocumentRow.tsx` (meta line: `date · N trang · size`)
  - `src/components/NameInput.tsx` (`{value, onChangeText, placeholder?}`, maxLength 100)
- Testing note: in RNTL v14 `fireEvent` is async too and must be awaited.
- Tests: 3 new; full suite 49/49.
- Deferred minors: the Alert flows are untested; Pressables lack `accessibilityRole`.

### Task 9 — Scan review screen (✅ `01a1e98`)
- `app/scan.tsx`:
  - Scans automatically once per mount (ref guard).
  - Shows a DraggableFlatList with `Trang N`, a 64×88 thumbnail and a `Xoá` button per page.
  - Buttons: `+ Chụp thêm` and `Tạo PDF`. Both scanning and creating go through `busy.run`, so the buttons are disabled while busy.
  - Errors:
    - `CAMERA_PERMISSION` shows an Alert with `Mở Cài đặt`/`Huỷ`.
    - Any other scan error shows `Không thể scan tài liệu`.
    - Back-navigation happens only when no pages have been collected.
  - On success it calls `refresh()` then `router.replace('/viewer/<id>')`.
- Tests: 5 (the 4 from the plan plus permission → Huỷ goes back); full suite 54/54.
- Manual checks needed on device: real drag-to-reorder, and page renumbering after a delete or reorder.
- Deferred minors:
  - If `refresh()` fails after the PDF is created, the screen shows a "can't create" error, so the user may create a duplicate.
  - `findIndex` is called inside `renderItem`.
  - Some alert paths are untested.

### Task 10 — Merge PDFs screen (✅ `8df0e86`)
- `app/merge.tsx`:
  - Picks files automatically once per mount, then runs `loadPickedPdfs` and appends the results.
  - Files that fail to load trigger the Alert `Không đọc được file` with their names.
  - Each row shows the file name, `N trang` and `Xoá`.
  - `Gộp PDF` is enabled only when there are at least 2 files and the screen is not busy; otherwise the hint `Chọn ít nhất 2 file PDF` is shown.
  - A merge failure shows `Không thể tạo PDF`. A `refresh()` failure after a successful merge is ignored and the app still navigates to the viewer, which avoids duplicate documents.
- Tests: 4; full suite 58/58.
- Deferred minors: the merge-failure path and the refresh-failure path are untested.

### Task 11 — Viewer & verification (✅ `9a2c701`)
- `app/viewer/[id].tsx`:
  - Shows an `ActivityIndicator` while loading.
  - An unknown id shows `Không tìm thấy tài liệu` and a `Quay lại` button.
  - A known id renders `react-native-pdf` with a `Chia sẻ` button in the header. Share errors show `Có lỗi xảy ra`.
- `README.md` (Vietnamese) covers the features, dev build steps (Expo Go is not supported), and a manual test checklist that includes the device-only checks.
- Final verification: jest 60/60, typecheck clean, expo-doctor 21/21, `expo export --platform android` bundle OK.

## Final whole-branch review (✅)
- Opus review: **With fixes**. 1 Critical (DraggableFlatList with no `containerStyle` pushed the `Tạo PDF`/`Gộp PDF` buttons off-screen), 7 Important (Android 4-button alert could not be closed; scan showed a failure when refresh failed after create; temp image files leaked; permission text is localized; NameInput autoFocus; README/EAS; AGENTS.md).
- Fix wave `ad4307e`..`3ab419b` (8 commits) fixed all 15 items; scoped re-review: all ADDRESSED, no new Critical/Important.
- Verification (re-run by the controller): jest **86/86**, typecheck clean; implementer: expo-doctor 21/21, `expo export --platform android` OK.
- **Status: the plan is complete.** Remaining: manual testing on real Android/iOS devices (checklist in README.md), merged into `master` on 2026-10-05 (jest 86/86, typecheck clean on master).

## Android emulator test (2026-10-05)

### Environment setup (reuse in later sessions)
- Android SDK is at `D:\Android\Sdk`. It was installed with command-line tools **13114758**. The newest version (16111833) runs "Android CLI" with a bundled JRE that Windows Application Control blocks, so do not upgrade.
- Packages installed: platform-tools, emulator, platforms;android-36, build-tools;36.0.0 (Gradle added 35.0.0 itself), ndk;27.1.12297006, cmake 3.22.1, system-images;android-35;google_apis_playstore;x86_64.
- The AVD is `iscanner_pixel` (Pixel 7, Android 15, Google Play, 4GB RAM, back camera = virtualscene). Acceleration is WHPX.
- Environment variables: `JAVA_HOME=/c/Users/hdlyn/.jwmv/candidates/java/17.0.20.1-ms`, `ANDROID_HOME='D:\Android\Sdk'`.
- Start the emulator: `D:/Android/Sdk/emulator/emulator.exe -avd iscanner_pixel -no-snapshot-save`.
- Build and install: `npx expo run:android --no-bundler --device iscanner_pixel`. The first build took about 22 minutes. `android/` is gitignored and prebuild changed the `android`/`ios` scripts in `package.json` to `expo run:*`.
- Metro: `npx expo start --dev-client`, then `adb reverse tcp:8081 tcp:8081`.
- Gotchas:
  - In Git Bash, `export MSYS_NO_PATHCONV=1` is needed before `adb shell` commands that take paths.
  - adb taps trigger Gboard's "Try out your stylus" tutorial. Turn it off with `adb shell settings put secure stylus_handwriting_enabled 0`.
  - The dev-client floating gear button covers the `Chia sẻ` header button. It is dev-only; drag it aside.

### Results — all PASS
- Library: empty state, Vietnamese copy, row meta line (`date · N trang · size`).
- Scan:
  - ML Kit scanner opens. On first use, Google Play services downloads the module, which takes a few seconds.
  - Auto-capture and edge crop work. Multiple pages can be added.
  - The review screen shows the default name, thumbnails, and `Xoá` per page.
- Scan with 10 pages: the list scrolls and the `Tạo PDF` button stays reachable (confirms the final-review Critical fix). Deleting a page renumbers the rest. The resulting PDF has 9 pages.
- Merge:
  - The system picker multi-selects from Downloads. Page counts show (1 and 2).
  - **Drag-to-reorder works** (draggable-flatlist with Reanimated 4). The merged PDF follows the new order (B1, B2, A1).
- Viewer: react-native-pdf renders all pages, and the title is the document name.
- Share: the Android share sheet opens (Quick Share, Drive, Messages, Bluetooth, Print).
- Long-press menu (Android Modal): shows Đổi tên / Chia sẻ / Xoá / Huỷ, and Back dismisses it (confirms the final-review fix).
- Rename and delete (with confirm `Xoá tài liệu này?`) work. The PDF file is removed from `files/pdfs`, and `library.json` stays consistent.
- Temporary files: after create and merge, the app cache holds no leftover scan images or picked copies.

### New finding — fixed
- **The shared file name was the internal id** (e.g. `muupj3n46e1r08.pdf`). Fixed: `shareFileName(name)` in `src/utils/format.ts` builds a safe file name. It replaces ` / : * ? " < > |` and control characters with `-`, collapses whitespace, strips trailing dots, caps the length at 100, keeps Vietnamese diacritics, and falls back to `tai-lieu.pdf`. `shareDocument(uri, name)` copies the file to `cache/share/<name>.pdf` (the folder is cleared on each share) and shares that copy. Tests: 92/92. Verified on the emulator: the share sheet shows `Hop dong tong hop.pdf`.

### Not testable on the emulator
- iOS (needs EAS and an Apple Developer account).
- Camera-permission denial: Android ML Kit needs no runtime camera permission.
- Real-paper scan quality: the emulator camera only shows a virtual scene.

## iOS build (2026-10-05)
- The user asked for an IPA and then dropped it. On Windows an IPA can only be built through EAS Build, and it needs an Expo account. Ad-hoc and App Store builds also need a paid Apple Developer account; ad-hoc additionally needs each iPhone's UDID registered. A simulator build produces a `.app` that runs only on a Mac simulator.
- To do it later: `npx eas-cli login`, then `npx eas-cli build --platform ios --profile preview` (ad-hoc, after `npx eas-cli device:create`) or `--profile production` (TestFlight). Profiles are in `eas.json`.
- **Free path chosen (no Apple Developer):** the code was pushed to the private repo https://github.com/LamNguyenViet/iscanner (local `master` tracks `origin/main`). The remote's initial README was merged, keeping the project README. Workflow `.github/workflows/ios-unsigned-ipa.yml` runs on `macos-latest` with latest-stable Xcode: `npm ci`, tests and typecheck, `expo prebuild --platform ios`, `pod install`, then a Release `xcodebuild` with signing disabled. It packages artifact `iScanner-unsigned-ipa` (kept 14 days). It runs on push to `main` (docs/md ignored) or manually via Run workflow. Install on an iPhone with Sideloadly and a free Apple ID; the app expires after 7 days. Steps are in README.md.
- The first run was triggered by the push of `3f47437`. Its result has not been checked yet: the repo is private, so its status can only be seen in the GitHub Actions tab.

## Android release APK (2026-10-05)
- Build command: `cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a` (needs JAVA_HOME and ANDROID_HOME as in the emulator section). It took about 19 minutes.
- Output: `dist/iScanner-1.0.0.apk` (about 63 MB; `dist/` is gitignored).
  - Package `com.dlbk.iscanner`, version 1.0.0 (versionCode 1), target SDK 36.
  - ARM only. It will not install on the x86_64 emulator.
  - The JS bundle is embedded, so no Metro is needed.
- It is signed with the **debug keystore**, which is fine for sideloading and testing. Google Play needs a real release keystore (or EAS-managed signing).
