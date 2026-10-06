# iScanner — Receive Shared Files (Zalo & other apps) — Design Spec

- **Date:** 2026-10-06 (follows sequence 2 survey)
- **Source:** `requirement/requirement.txt` ("06/10/2026 - sequence 2"), research `docs/superpowers/research/2026-10-06-share-intent.md`
- **Status:** Draft — awaiting user review

## 1. Goal & decisions

iScanner appears as a target when the user shares or "opens with" PDFs/images from Zalo and other apps, and the received files flow into the existing merge / scan features.

| Topic | Decision |
|---|---|
| Scope | **Android**: share sheet (`SEND`, `SEND_MULTIPLE`) + "Open with" (`VIEW`). **iOS**: "Open in / Copy to iScanner" via document types. **No iOS Share Extension.** |
| Mechanism | Existing `expo-sharing` 57.0.22 config plugin + `getResolvedSharedPayloadsAsync` (experimental) for Android shares; expo-router `app/+native-intent.ts` for file URLs (Android `VIEW`, iOS open-in). No new dependency. |
| Handling | **1 PDF** → confirm screen: `Lưu vào thư viện` / `Gộp với file khác`. **≥ 2 PDFs** → merge screen pre-filled. **Images only** → scan review pre-filled (Full HD normalized). **Mixed** → do both: PDF step first (rules above), then the scan review opens with the images. |

Out of scope: iOS Share Extension, sharing text/URLs/videos, Office documents (doc/docx/xlsx), sharing into an existing document.

## 2. Native configuration (`app.json`)

- Plugin entry (option names verified against `node_modules/expo-sharing/plugin/build/sharingPlugin.types.d.ts`):
  ```json
  ["expo-sharing", {
    "ios": { "enabled": false },
    "android": {
      "enabled": true,
      "singleShareMimeTypes": ["application/pdf", "image/*", "application/octet-stream"],
      "multipleShareMimeTypes": ["application/pdf", "image/*", "application/octet-stream"]
    }
  }]
  ```
  `application/octet-stream` is included because Zalo's MIME type is unverified; content is classified by magic bytes, so unsupported files are rejected in-app. `*/*` is deliberately not used.
- `android.intentFilters`: `{ action: "VIEW", category: ["DEFAULT", "BROWSABLE"], data: [{ scheme: "content", mimeType: "application/pdf" }, { scheme: "content", mimeType: "image/*" }] }`.
- `ios.infoPlist`:
  - `CFBundleDocumentTypes`: `{ CFBundleTypeName: "PDF", LSItemContentTypes: ["com.adobe.pdf"], LSHandlerRank: "Alternate", CFBundleTypeRole: "Viewer" }` and `{ CFBundleTypeName: "Image", LSItemContentTypes: ["public.image"], LSHandlerRank: "Alternate", CFBundleTypeRole: "Viewer" }`
  - `LSSupportsOpeningDocumentsInPlace: false` (iOS copies the file into the app's Inbox and passes a `file://` URL).

## 3. Modules

### 3.1 `src/share/incomingFiles.ts`
```ts
type IncomingKind = 'pdf' | 'image' | 'unsupported';
type IncomingFile = { uri: string; name: string; kind: 'pdf' | 'image'; size: number }; // uri = copied cache file
classifyIncoming(bytes: Uint8Array): IncomingKind   // pure: '%PDF' → pdf; JPEG/PNG (detectImageType) → image; else unsupported
importIncoming(sources: { uri: string; name?: string }[], deps?): Promise<{ files: IncomingFile[]; skipped: { name: string; reason: 'unsupported' | 'too-large' | 'unreadable' }[] }>
type IncomingPlan =
  | { kind: 'none' }
  | { kind: 'single-pdf'; pdf: IncomingFile; images: IncomingFile[] }   // images non-empty ⇒ mixed
  | { kind: 'merge'; pdfs: IncomingFile[]; images: IncomingFile[] }
  | { kind: 'scan'; images: IncomingFile[] };
planIncoming(files: IncomingFile[]): IncomingPlan  // pure
```
- `importIncoming` copies each source **immediately** to `Paths.cache/incoming/<id>.<pdf|jpg|png>` (Android content-URI grants expire), reads the first 8 bytes to classify, rejects files > **100 MB** (`too-large`) and unclassifiable (`unsupported`), deleting rejected copies. Display name: provided name, else last URI path segment, else `Tài liệu`. Never throws for a single bad file (`unreadable`).

### 3.2 `src/share/incomingStore.ts`
In-memory, take-once: `setPending({ pdfs, images })`, `takePdfs(): IncomingFile[]`, `takeImages(): IncomingFile[]`, `hasPendingImages(): boolean`, `clearPending(): IncomingFile[]` (returns what was dropped so callers can delete files).

### 3.3 `src/native/sharedPayloads.ts`
Thin wrapper (mocked in tests): `readSharedFiles(): Promise<{ uri: string; name?: string }[]>` → `getResolvedSharedPayloadsAsync()` filtered to `contentType` `file`/`image` with a `contentUri`; `clearSharedFiles()` → `clearSharedPayloads()`. Android only (returns `[]` elsewhere).

### 3.4 `app/+native-intent.ts`
expo-router `redirectSystemPath({ path, initial })`: if `path` starts with `file://` or `content://` → `/incoming?uri=<encodeURIComponent(path)>`; if it is the expo-sharing share entry (check what expo-sharing/Android delivers on `SEND` — if the app launches with no path or a known marker, route to `/incoming`), keep other paths unchanged. Must never throw (return the original path on error).

### 3.5 `app/incoming.tsx` (route, title `Nhận file`)
1. On mount: collect sources = `uri` param (if any) else `readSharedFiles()`; then `clearSharedFiles()`. Drop any previous pending files (delete them). Show `Đang nhận file…` while `importIncoming` runs.
2. If skipped > 0 → Alert `Bỏ qua N file không hỗ trợ hoặc quá lớn` (non-blocking).
3. `planIncoming`:
   - `none` → Alert `Không có file PDF hoặc ảnh hợp lệ` → `router.replace('/')`.
   - `single-pdf` → confirm view: file name, page count (`getPdfPageCount`), buttons **`Lưu vào thư viện`** (`store.add(bytes, { name, pageCount, source: 'merge' })` → `refresh()` → if images pending go to scan else `router.replace('/viewer/<id>')`) and **`Gộp với file khác`** (`setPending({ pdfs:[pdf], images })` → `router.replace('/merge')`); header back = cancel (delete pdf copy; if images pending go to scan else go home).
   - `merge` → `setPending({ pdfs, images })` → `router.replace('/merge')`.
   - `scan` → `setPending({ pdfs: [], images })` → `router.replace('/scan')`.

### 3.6 `app/merge.tsx` / `app/scan.tsx` (changed)
- On mount, before the existing auto-pick / auto-scan: `merge` uses `takePdfs()` if non-empty (load via existing `loadPickedPdfs` with `{uri,name}`) instead of opening the picker; `scan` uses `takeImages()` if non-empty (run the existing normalize pipeline; delete the incoming copies after normalizing) instead of opening the camera.
- `merge` after a successful merge (and `incoming` after `Lưu vào thư viện`): if `hasPendingImages()` → `router.replace('/scan')` instead of the viewer; the viewer of the merged doc remains reachable from the library.
- Existing cleanup rules apply (merge deletes its cache copies; scan deletes page files on unmount/success).

## 4. Error handling

| Situation | Behaviour |
|---|---|
| File unreadable / copy fails | Skipped (`unreadable`), counted in the skip alert |
| No valid file | Alert `Không có file PDF hoặc ảnh hợp lệ`, go home |
| Encrypted / corrupt PDF | Existing merge alert `Không đọc được file`; single-pdf save path: Alert `Không đọc được file` and go home |
| New share arrives while a previous one is pending | Previous pending files are deleted and replaced |
| `+native-intent` parse error | Original path returned (no crash) |

## 5. Testing
- **Unit:** `classifyIncoming` (pdf, jpeg, png, garbage, empty); `planIncoming` (none, 1 pdf, ≥2 pdf, images only, mixed with 1 pdf, mixed with ≥2 pdf); store take-once + clear; `importIncoming` (size limit, unreadable, rename/extension, deletes rejected copies) with mocked fs; `+native-intent` (file/content → /incoming, normal deep link unchanged, garbage safe).
- **Screens:** `incoming` (single-pdf save → viewer; save with pending images → scan; `Gộp với file khác` → merge with store; none → home; skipped alert); `merge` / `scan` consume the store instead of picker/camera; merge with pending images → scan after saving.
- **Android emulator:** share a PDF and images from the Files app; `adb shell am start -a android.intent.action.SEND -t application/octet-stream --eu android.intent.extra.STREAM content://…` (Zalo-like); `VIEW` a PDF ("Open with"); `SEND_MULTIPLE` mixed.
- **iOS:** CI unsigned IPA build succeeds and Info.plist contains the document types; functional test on a real iPhone by the user.

## 6. Success criteria
1. On Android, iScanner appears in the share sheet for PDFs/images (incl. `application/octet-stream`) and in "Open with" for PDFs; received files reach the correct flow per §1.
2. On iOS, iScanner appears in "Open in / Copy to" for PDFs and images, and the file reaches the same flows.
3. Unsupported/oversized files are skipped with a message; no crash on any input.
4. All tests and typecheck pass; Android flows verified on the emulator.
