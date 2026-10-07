# Dependency audit: CVEs and Android/iOS compatibility (2026-10-07)

- **Source:** requirement "07/10/2026 - sequence 2", part 1 of 5 ("Kiểm tra xem các thư viện có lỗi cve hoặc lỗi trên các thiết bị cài đặt android ios version khác nhau không, nếu có cần cập nhật vá lỗi").
- **Type:** spike. It produces findings and recommendations. No app code was changed, and the probes were throwaway scripts kept outside the repo.
- **Baseline:** master `e545530`. Expo SDK 57.0.26, RN 0.86.3 (New Architecture).
- **Supported platforms:**
  - Android: `minSdk` 24 (Android 7.0), `targetSdk`/`compileSdk` 36, NDK 27.1.
  - iOS: deployment target 16.4 (Expo SDK 57 floor).

## Summary

| # | Finding | Reaches users? | Severity for iScanner | Recommendation |
|---|---|---|---|---|
| F1 | `pdf-lib` 1.17.1 (unmaintained since 2021) inflates FlateDecode streams with no size limit during `PDFDocument.load` (decompression bomb, the same code as CVE-2026-82864 / GHSA-vrqm-gvq7-rrwh, fixed only in the `@pdfme/pdf-lib` fork ≥ 5.5.10) | **Yes.** Any PDF that is shared, "Opened with" or picked goes through `pdf-lib` (page count, merge, save) | **High** | Replace it with `@pdfme/pdf-lib` ≥ 5.5.10, after a compatibility spike on device |
| F2 | `react-native-pdf` 7.0.5 Android native memory leak (~3 MB for each viewer mount; issue #1046, fix PR #1047 not released) | **Yes.** Every document opened in the viewer | Medium | Wrap `<Pdf>` in `memo` (the documented workaround) and upgrade when 7.0.6+ ships |
| F3 | `decode-uri-component` ≤ 0.4.2 (GHSA-vcc3-ghjq-m6fr, CPU DoS on malformed percent-encoding). Used through `query-string@7` in expo-router's `getStateFromPath`, which parses incoming deep links | Yes. Any app or website can open an `iscanner://…` link | Moderate | Reject over-long incoming paths in `app/+native-intent.ts` (the advisory's workaround is "limit the size of the input"). The full fix needs expo-router 58 (SDK 58) |
| F4 | Expo patch drift: `expo` 57.0.27, `expo-constants` 57.0.21, `expo-image-manipulator` 57.0.21, `expo-linking` 57.0.12, `expo-router` 57.0.25 (from `expo-doctor`) | Possibly (patch fixes) | Low | `npx expo install --check` (patch upgrades within SDK 57) |
| F5 | Build-time and test-only advisories: `node-forge` ≤ 1.4.0, `braces` ≤ 3.0.3, `micromatch`, `sprintf-js`, `js-yaml` 3, `uuid` < 11.1.1 (via `xcode`), and the jest/metro chains | **No.** They are not in the app bundle; they run only on the developer machine and CI | Info | No action. **Do not run `npm audit fix --force`**: its "fixes" downgrade `expo` to 44, `react-native` to 0.72 and RNTL to 13. `node-forge`, `braces` and `sprintf-js` have no patched release yet |
| F6 | Android 16 KB page size | — | OK / watch | All 25 arm64 `.so` files have 16 KB `LOAD` alignment and pass `zipalign -P 16`. GNU_RELRO end-alignment is off in almost every lib, including Hermes, fbjni and libc++ (react-native-pdf issue #1048). This is an ecosystem-wide check, not a load failure. Run the app once on an Android 15 **16 KB** emulator image |
| F7 | Document scanner (ML Kit) requires Google Play services | Yes. Huawei and AOSP devices without GMS cannot scan | Behavior limit | Already handled by the `Không thể scan tài liệu` alert. Improve the message in part 3 (localized error popups). The PDF merge and share features still work there |

npm audit totals (`--omit=dev`): 63 (16 moderate, 47 high, 0 critical). Almost all of them propagate from the four leaf advisories in F3 and F5. The only leaf that ships inside the app is `decode-uri-component` (F3). pdf-lib (F1) has **no** npm advisory because upstream is unmaintained, so `npm audit` does not show it.

## Evidence

### F1: pdf-lib decompression bomb (verified)
- `node_modules/pdf-lib/cjs/core/streams/DecodeStream.js:133`: `ensureBuffer` doubles its size until it fits the request, with no upper bound. This is the same code that the pdfme fork patched in 5.5.10.
- **Probe** (a throwaway Node script): it builds a minimal PDF whose `/ObjStm` stream is Flate-compressed zeros, then runs `PDFDocument.load(bytes)` with pdf-lib 1.17.1.

  | Inflated size | Load time | Process RSS |
  |---|---|---|
  | 50 MB | 225 ms | 95 MB |
  | 400 MB (file ≈ 0.4 MB) | 1.6 s | 445 MB |

  Object streams are decoded during `load()`, so a file of a few hundred KB, well under iScanner's 100 MB import cap, can drive memory past what a phone gives the JS heap and crash the app.
- **Exposure in iScanner:** `getPdfPageCount` (incoming single-PDF confirm), `loadPickedPdfs` and `mergePdfs` (merge), all fed by files from other apps (Zalo etc.).
- **Candidate fix:** `@pdfme/pdf-lib` (latest 6.2.4, actively maintained, fix since 5.5.10). It is a fork of the same API, but this must be confirmed: import path, `PDFDocument.load` / `copyPages` / `save` behavior, extra dependencies (`node-html-better-parser`, `color`, `pako` 3) running under Hermes, and bundle size. If the fork is unsuitable, the fallback is a defensive guard: a timeout/size budget around the pdf-lib calls, plus an error popup.

### F2: react-native-pdf leak
- Issue #1046: each mount runs `drawPdf()` three times. The cancelled decode tasks leak the opened PDFium document, which costs ~3 MB per mount; native heap went from 81 to 513 MB over 142 cycles. PR #1047 is proposed but not released. The workaround is to wrap `<Pdf>` in `memo` to cut re-renders.
- 7.0.1 already fixed the 16 KB support and a multithreading crash, and 7.0.4 fixed "IllegalStateException: Already closed". iScanner is on 7.0.5.

### F3: deep-link decoding
- expo-router uses `query-string` 7.1.3, which depends on `decode-uri-component` 0.2.2, in `build/react-navigation/core/getStateFromPath.js` and `getPathFromState`.
- iScanner's `redirectSystemPath` passes non-file paths through unchanged, so a long malformed `iscanner://x?q=%E0%A4%A…` reaches the vulnerable decoder.
- A local probe showed roughly linear growth for simple patterns (32 KB → 132 ms). Pathological patterns are what the advisory describes.
- Cheap mitigation in our code: return `/` for incoming paths longer than about 2 KB. No real iScanner link is longer than a `content://` URI.

### F4–F7
- `npx expo-doctor`: 20/21 checks pass; the only failure is the patch drift listed in F4.
- `npm outdated`: the native third-party libs (`react-native-pdf` 7.0.5, `react-native-blob-util` 0.25.1, `react-native-document-scanner-plugin` 2.0.4, `react-native-fast-opencv` 1.0.1, `react-native-draggable-flatlist` 4.0.3) are on their latest releases. The newer majors (RN 0.87, gesture-handler 3, worklets 0.13) belong to SDK 58 and are out of scope.
- **16 KB check:** run on the 1.3.0 release APK with `zipalign -c -P 16 -v 4` (100/100 `.so` OK) and `llvm-readelf -lW` (all arm64 `LOAD` aligned 0x4000).
- **Minimum OS versions:**
  - Android: ML Kit document scanner needs API 21+, Reanimated 4 needs API 24+, and the app's `minSdk` is 24. No conflict.
  - iOS: the pods' floors are 11.0–16.4, and the app floor is 16.4. No conflict.

## Recommended patch set (a bounded change after approval)
1. **F1:** a short device spike that swaps in `@pdfme/pdf-lib`, then the swap itself with tests. Add a regression test that loads a bomb PDF and expects a clean `PdfLoadError` (or a bounded failure) instead of unbounded memory.
2. **F2:** a memoized `<Pdf>` in `app/viewer/[id].tsx`.
3. **F3:** a length cap in `redirectIncomingPath`, with a test.
4. **F4:** `npx expo install --check`, then run the tests, typecheck and an emulator smoke test.
5. **F6:** a one-off smoke test on an Android 15 16 KB emulator image (system image `…16k…`).

Not recommended now: an Expo SDK 58 major upgrade, `npm audit fix --force`, or `npm overrides` forcing `decode-uri-component` 0.5 (it is ESM-only and `query-string` 7 `require`s it).

## Sources
- [GHSA-vrqm-gvq7-rrwh / CVE-2026-82864 (pdfme pdf-lib decompression bomb)](https://app.opencve.io/cve/CVE-2026-82864)
- [GHSA-vcc3-ghjq-m6fr (decode-uri-component)](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr)
- [react-native-pdf #1046 native memory leak](https://github.com/wonday/react-native-pdf/issues/1046)
- [react-native-pdf #1048 PDFium GNU_RELRO end-alignment](https://github.com/wonday/react-native-pdf/issues/1048)
- [react-native-pdf releases](https://github.com/wonday/react-native-pdf/releases)
- [react-native-document-scanner-plugin (ML Kit requires Google Play services)](https://github.com/Preeternal/react-native-document-scanner-plugin)
