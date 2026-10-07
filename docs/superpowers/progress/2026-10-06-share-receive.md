# iScanner — Receive Shared Files — Progress Log

- **Requirement:** `requirement/requirement.txt` "06/10/2026 - sequence 2". Survey: `docs/superpowers/research/2026-10-06-share-intent.md`.
- **Spec:** `docs/superpowers/specs/2026-10-06-share-receive-design.md`
- **Plan:** `docs/superpowers/plans/2026-10-06-share-receive.md`
- **Branch:** `feat/share-receive` (from `master` @ `19e8cd6`)
- **Execution:** superpowers:subagent-driven-development.
- **Resume rule:** tasks marked ✅ are done.

## User decisions
- Scope A: Android share sheet (SEND/SEND_MULTIPLE) plus "Open with" (VIEW), and iOS "Open in" (document types). No iOS Share Extension.
- Handling C:
  - 1 PDF: confirm screen with Lưu vào thư viện / Gộp với file khác.
  - ≥2 PDFs: open the merge screen.
  - Images: open scan review.
  - Mixed: do both, PDFs first and then the images.
- Mechanism: `expo-sharing` 57.0.22 plugin (Android) plus expo-router `+native-intent`. The share link is `iscanner://expo-sharing`.

## Tasks
| # | Task | Status | Commits | Notes |
|---|---|---|---|---|
| 1 | Classify / plan / pending store | ✅ | `b586789` | review clean |
| 2 | Import to cache + payload wrapper | ✅ | `26cf873` | review clean |
| 3 | app.json + native-intent + incoming screen | ✅ | `2e13bed` | review clean |
| 4 | Merge/scan consume pending files | ✅ | `57e284f`, `15e6ce2` | 1 fix round (R4) |
| 5 | Device verification + docs | ✅ | `2d0840f`, `b61cd9c`, `24d3988` | 2 device fixes; verified on emulator |

## Task details

### Task 1 (✅ `b586789`)
- `src/share/types.ts` defines `IncomingFile` and `IncomingPlan`.
- `classify.ts`: magic bytes `%PDF-` mean pdf; JPEG and PNG mean image. Ruling R2: `%PDF-` is 5 bytes.
- `plan.ts` decides the flow: none, single-pdf (with images), merge (with images), or scan. Order is preserved.
- `incomingStore.ts`: `setPending` returns the dropped files; `takePdfs` and `takeImages` read once; there are also `hasPendingImages` and `clearPending`.
- Tests: 246/246.

### Task 2 (✅ `26cf873`)
- `src/share/importIncoming.ts`:
  - `importIncoming(sources)` reads `new File(uri).bytes()` and writes `Paths.cache/incoming/<id>.<pdf|jpg|png>`.
  - The size is checked before (`size`) and after reading (100 MB limit).
  - A bad file is put in `skipped` (unsupported, too-large or unreadable) and the import continues.
- `src/native/sharedPayloads.ts`: `readSharedFiles()` (Android only, file/image payloads, name from `originalName`) and `clearSharedFiles()`.
- Reading `content://` with `expo-file-system` is supported; confirmed in `FileSystemPath.kt` and `ContentProviderFile.kt`.
- Tests: 253/253.

### Task 3 (✅ `2e13bed`)
- `app.json` contains the `expo-sharing` plugin (Android SEND/SEND_MULTIPLE for pdf, image/*, octet-stream; iOS off), a VIEW `content` intent filter, and the iOS `CFBundleDocumentTypes` entries (PDF/Image, Alternate) with `LSSupportsOpeningDocumentsInPlace: false`. `expo config --type introspect` is OK and expo-doctor passes 21/21.
- `app/+native-intent.ts` redirects through `src/share/redirect.ts`:
  - `file://` and `content://` go to `/incoming?uri=…` (**double-encoded**: ruling R3, confirmed that expo-router decodes twice).
  - `iscanner://expo-sharing` goes to `/incoming`.
  - Every other path is left unchanged.
- `app/incoming.tsx` (`Nhận file`):
  - Imports the files, alerts about skipped ones, then routes to none / single-pdf (Lưu vào thư viện / Gộp với file khác) / merge / scan.
  - Copies are deleted on every exit path.
- Deferred minors for the final review:
  - **A second share that arrives while `/incoming` is on top is ignored.**
  - **Pending images are orphaned on an unexpected unmount.**
  - Two alerts appear back to back.
- Tests: 280/280.

### Task 4 (✅ `57e284f`, fix `15e6ce2`)
- `app/merge.tsx`:
  - On mount it runs `takePdfs()`. Files go through the same load/append pipeline as the picker; with no files it opens the picker as before.
  - A successful merge with images still pending goes to `/scan`.
  - **Ruling R4**:
    - If every PDF fails and images are pending, the app goes to `/scan` instead of back.
    - If the user leaves the merge screen without merging, the pending images are deleted. This prevents leaks and a wrong redirect later.
- `app/scan.tsx`: on mount it runs `takeImages()`, then the same normalize pipeline as the scanner, deleting the incoming copies after normalization.
- Tests: 288/288.

### Task 5 — Device verification (✅)
- Prebuild produced the SEND/SEND_MULTIPLE (pdf, image/*, octet-stream) and VIEW content intent filters, plus `share_into_scheme=iscanner`.
- **Bugs found on the device and fixed:**
  1. `2d0840f`: when the app was already open, a share did nothing. Root cause: `expo-sharing` reports the share only through a **one-shot JS link event**, and if JS isn't listening yet the event is lost. Fix: the root layout checks for pending shares at startup and every time the app returns to the foreground, then opens `/incoming`. The incoming screen re-reads on foreground, so a second share switches to the new file.
  2. `b61cd9c`: "Open with" from Files showed the name `primary:Download/x.pdf`. Fix: new helper `src/share/displayName.ts` that takes the part after the last `/` and the last `:` and decodes `%`.
- **Verified on the emulator:**
  - Debug build, app already open:
    - share 1 PDF → Nhận file (name, page count, Lưu / Gộp);
    - share 2 PDFs → merge screen pre-filled;
    - share 2 PDFs + 1 JPG → merge, then scan with the image after merging;
    - Open with → Nhận file;
    - Lưu vào thư viện → document saved with the right name.
  - Release build, app fully closed: share from Files → opens straight on Nhận file.
- iOS: it cannot be prebuilt on Windows. `expo config --type introspect` shows CFBundleDocumentTypes (PDF and Image, Alternate) and `LSSupportsOpeningDocumentsInPlace=false`, and the **entitlements are empty** (no App Group), so it works with a free Apple ID. It still needs a test on a real iPhone.
- README now has the 1.2.0 features and a checklist.
- Not testable on the emulator: the real Zalo app, and the MIME type Zalo actually sends.

## Final whole-branch review (2026-10-07)
- Opus review verdict: **With fixes**. 0 Critical; 2 Important:
  1. **Security:** `getResolvedSharedPayloadsAsync` made expo-sharing write the file to `cacheDir/<name supplied by the sender>`. That allowed path traversal over iScanner's private files, left a copy in the cache on every share, bypassed the 100 MB limit, and let same-named files overwrite each other.
  2. On iOS, files opened through "Open in" were left in `Documents/Inbox` for good.
- Fix wave `881a54a`..`8b2e398`:
  - **R5:** switched to `getSharedPayloads()`, which copies nothing natively; the app reads `content://` directly.
  - **R6:** the Inbox copy is deleted after import (`src/share/inbox.ts`).
  - Minors fixed: `dismissTo('/')` so no extra back arrow; images are cleaned up on unmount while undecided; only `file`/`content` schemes are accepted; a single alert.
- **R8 (trade-off):** SDK 57 cannot read a shared file's real `DISPLAY_NAME` without writing a file under that name, which is exactly the hole being closed, so names are derived from the URI. Some senders will show opaque names, for example `1000`. Follow-up: a small native module that only reads `DISPLAY_NAME`.
- Scoped re-review: ADDRESSED except **one open issue: the Inbox guard accepts `..` segments**. A deep link could make the iOS app delete a library file outside the Inbox; this is hard to exploit because it needs the container UUID. Process allows no second fix wave, so this is waiting on the user's decision.
- Device re-check after the fixes (emulator):
  - share → Nhận file with the right name;
  - no file named by the sender is written to the cache;
  - cancel → library with no back arrow.
- Tests: jest **323/323**, typecheck clean. expo-doctor reports 5 packages one patch behind upstream; this branch did not cause it.
