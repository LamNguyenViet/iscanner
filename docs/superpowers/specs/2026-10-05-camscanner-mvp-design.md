# iScanner MVP — Design Spec

- **Date:** 2026-10-05 (sequence 1)
- **Source:** `requirement/requirement.txt`
- **Status:** Approved (2026-10-05)

## 1. Goal

A mobile app for Android and iOS, similar to CamScanner, with two features:

1. **Scan → PDF:** use the phone camera to scan documents/photos (edge detection, crop, perspective correction) and merge all scanned pages into a single PDF.
2. **Merge PDFs:** pick multiple PDF files from device storage and merge them into a single PDF.

Generated PDFs are kept in an in-app library and can be shared/exported via the OS share sheet.

### Decisions made with the user

| Topic | Decision |
|---|---|
| Stack | React Native + Expo (TypeScript, Expo Router) |
| Output handling | In-app library + share/export via OS share sheet |
| Editing before export | Lightweight review screen: reorder, delete, add more (pages or files); no in-app image editing |
| UI language | Vietnamese (assumption, user did not object) |
| PDF engine | Pure JS `pdf-lib`; metadata in a JSON file (no SQLite, no native modules of our own) |

### Out of scope (sequence 1)

OCR, cloud sync, accounts, in-app image filters/rotation/re-crop, password-protected PDF handling (beyond rejecting them), PDF thumbnails rendered from page content, folders/tags, i18n.

## 2. Tech stack

| Concern | Library |
|---|---|
| Framework | Expo SDK (latest stable), React Native, TypeScript |
| Navigation | `expo-router` |
| Document scanning | `react-native-document-scanner-plugin` (Android: ML Kit Document Scanner; iOS: VisionKit) |
| PDF create/merge | `pdf-lib` |
| File I/O | `expo-file-system` |
| Pick PDFs | `expo-document-picker` |
| Share/export | `expo-sharing` |
| PDF viewer | `react-native-pdf` (+ `react-native-blob-util`) |
| Drag-to-reorder lists | `react-native-draggable-flatlist` (+ `react-native-gesture-handler`, `react-native-reanimated`) |
| Tests | `jest-expo`, `@testing-library/react-native` |

**Build constraint:** the scanner plugin and `react-native-pdf` contain native code, so the app does **not** run in Expo Go. A **development build** is required (Android local build with Android SDK, or EAS Build; iOS via EAS Build).

## 3. Screens and navigation

```
app/
  _layout.tsx        Stack navigator, GestureHandlerRootView, LibraryProvider
  index.tsx          Library (Home)
  scan.tsx           Scan review
  merge.tsx          Merge PDFs
  viewer/[id].tsx    PDF viewer
```

### 3.1 Library (Home) — `app/index.tsx`
- List of documents, newest first. Each row: name, created date (dd/MM/yyyy HH:mm), page count, file size.
- Empty state: short explanation + the two action buttons.
- Primary buttons: **"Scan tài liệu"** → `/scan`, **"Gộp PDF"** → `/merge`.
- Tap row → `/viewer/[id]`.
- Long-press row → action sheet: **Đổi tên**, **Chia sẻ**, **Xoá** (delete asks for confirmation).

### 3.2 Scan review — `app/scan.tsx`
- On mount, immediately launches the scanner. If the user cancels with zero pages collected, navigate back.
- Shows scanned pages as a draggable vertical list of thumbnails (page number + thumbnail + delete button).
- **"+ Chụp thêm"** launches the scanner again and appends new pages.
- Name input, default `Scan dd-MM-yyyy HH.mm`.
- **"Tạo PDF"** (disabled with 0 pages) → builds PDF → saves to library → navigates to `/viewer/[id]` (replace).
- Busy indicator while generating; buttons disabled.

### 3.3 Merge PDFs — `app/merge.tsx`
- On mount, opens the document picker (`type: application/pdf`, `multiple: true`, `copyToCacheDirectory: true`). Cancel with zero files → navigate back.
- Each picked file is loaded and validated (page count read via `pdf-lib`). Invalid/encrypted files are dropped and the user is told which file names failed.
- Draggable list: file name, page count, delete button. **"+ Thêm file"** appends more.
- Name input, default `Gộp dd-MM-yyyy HH.mm`.
- **"Gộp PDF"** is enabled only with ≥ 2 files → merges → saves → navigates to `/viewer/[id]` (replace).

### 3.4 Viewer — `app/viewer/[id].tsx`
- Header title = document name; header button **Chia sẻ**.
- Renders the PDF with `react-native-pdf`. Unknown id → "Không tìm thấy tài liệu" + back.

## 4. Modules

Pure logic lives in `src/` and does not import React Native UI.

### 4.1 `src/pdf/createPdfFromImages.ts`
```ts
type ImageInput = { bytes: Uint8Array; mimeType: 'image/jpeg' | 'image/png' };
createPdfFromImages(images: ImageInput[]): Promise<Uint8Array>
```
- One page per image; page size equals the image's pixel dimensions (points = pixels); image drawn full-page.
- Throws `Error('NO_IMAGES')` for an empty list.
- MIME type detection helper `detectImageType(bytes)` uses magic bytes (JPEG `FF D8`, PNG `89 50 4E 47`); unsupported type throws `UNSUPPORTED_IMAGE`.

### 4.2 `src/pdf/mergePdfs.ts`
```ts
mergePdfs(pdfs: Uint8Array[]): Promise<Uint8Array>
getPdfPageCount(pdf: Uint8Array): Promise<number>
```
- Copies all pages of each input, in order, into a new document.
- Throws `Error('NO_PDFS')` for an empty list.
- Encrypted or unparseable input → throws `PdfLoadError` with the input index.

### 4.3 `src/library/` — document store
```ts
type DocumentMeta = {
  id: string; name: string; fileName: string;
  createdAt: string; // ISO
  pageCount: number; sizeBytes: number;
  source: 'scan' | 'merge';
};
```
- Storage: `documentDirectory/pdfs/<id>.pdf` and `documentDirectory/library.json` (`{ version: 1, documents: DocumentMeta[] }`).
- API (`libraryStore.ts`), built on a small injectable file-system adapter (`fsAdapter.ts`) so it can be unit-tested with an in-memory fake:
  - `list(): Promise<DocumentMeta[]>` — newest first; missing/corrupt index → `[]` (corrupt file is backed up as `library.json.bak`).
  - `add(bytes, { name, pageCount, source }): Promise<DocumentMeta>` — writes PDF first, then index; if the index write fails the PDF is deleted.
  - `rename(id, name)`, `remove(id)` (deletes file + entry), `get(id)`, `fileUri(meta)`.
- Name sanitizing: trim; empty → default name; max 100 chars.
- `src/library/LibraryContext.tsx` exposes `useLibrary()` (documents, refresh, add, rename, remove) to screens.

### 4.4 `src/scanner/scanner.ts`
```ts
scanDocuments(): Promise<string[]> // file URIs of scanned images; [] if cancelled
```
Thin wrapper over `DocumentScanner.scanDocument({ croppedImageQuality: 90 })`; normalizes the cancel status to `[]`.

### 4.5 `src/utils/`
- `base64.ts` — `Uint8Array` ↔ base64 (used with `expo-file-system`).
- `format.ts` — date formatting, default names, human-readable file size.

## 5. Data flow

**Scan:** `scanDocuments()` → image URIs → (review: reorder/delete/add) → read each as base64 → bytes → `createPdfFromImages` → `library.add` → viewer.

**Merge:** picker → cached URIs → read bytes → `getPdfPageCount` (validate) → (review) → `mergePdfs` → `library.add` → viewer.

**Share:** `Sharing.shareAsync(fileUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' })`.

## 6. Permissions & config

- `app.json` plugins: `react-native-document-scanner-plugin` with iOS `NSCameraUsageDescription` ("Ứng dụng cần quyền camera để scan tài liệu."), `expo-document-picker`, `expo-router`.
- Android: ML Kit scanner needs no runtime camera permission from our app; picker uses SAF (no storage permission).
- App name "iScanner", slug `iscanner`, iOS bundle identifier and Android package `com.dlbk.iscanner`.

## 7. Error handling

| Situation | Behavior |
|---|---|
| User cancels scan / picker | Return to previous state silently (navigate back if nothing collected) |
| Camera permission denied (iOS) | Alert with button to open Settings (`Linking.openSettings()`) |
| Encrypted / corrupt PDF picked | Alert listing failed file names; those files are excluded |
| Fewer than 2 PDFs to merge | Merge button disabled |
| PDF generation / write failure | Alert "Không thể tạo PDF"; library unchanged |
| Corrupt `library.json` | Back up as `.bak`, start with empty library |

## 8. Testing

- **Unit (Jest):**
  - `createPdfFromImages`: JPEG + PNG fixtures → page count and page sizes match; empty list throws; unsupported bytes throw.
  - `mergePdfs`: 2 generated PDFs (1 + 2 pages) → 3 pages in order; empty list throws; garbage input throws `PdfLoadError` with index.
  - `libraryStore` with in-memory fs adapter: add/list ordering, rename, remove, corrupt index recovery, rollback on index write failure.
  - `format` helpers.
- **Static:** `tsc --noEmit`, `npx expo-doctor`.
- **Manual (device, dev build):** scan 3 pages → reorder → PDF has 3 pages in new order; merge 2 PDFs; rename/delete/share; cancel paths; deny camera permission on iOS.

## 9. Success criteria

1. On an Android and an iOS device (dev build), the user can scan multiple pages and get one PDF in the library containing those pages in chosen order.
2. The user can pick ≥ 2 PDFs from storage and get one merged PDF with all pages in chosen order.
3. Documents can be viewed, renamed, deleted and shared.
4. All unit tests and typecheck pass.
