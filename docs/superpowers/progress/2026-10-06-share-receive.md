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
| 5 | Device verification + docs | ⏳ | | |

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
