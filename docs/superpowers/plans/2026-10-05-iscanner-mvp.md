# iScanner MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Expo (React Native) app for Android and iOS that scans documents with the camera into one PDF, merges PDFs picked from storage into one PDF, and keeps results in an in-app library with view/rename/delete/share.

**Architecture:** Pure TypeScript logic in `src/` (PDF building with `pdf-lib`, a JSON-indexed document store behind an injectable file-system adapter, workflow functions composing them) is unit-tested with Jest. Expo Router screens in `app/` are thin: they call the workflows and the `useLibrary()` context. Native capabilities (scanner, picker, viewer, share) are wrapped in small modules so tests can mock them.

**Tech Stack:** Expo SDK (latest stable via `create-expo-app@latest`), TypeScript, expo-router, pdf-lib, expo-file-system (new `File`/`Directory`/`Paths` API), expo-document-picker, expo-sharing, react-native-document-scanner-plugin, react-native-pdf + react-native-blob-util, react-native-draggable-flatlist (+ gesture-handler, reanimated), jest-expo, @testing-library/react-native, pngjs + jpeg-js (dev, test fixtures only).

**Spec:** `docs/superpowers/specs/2026-10-05-camscanner-mvp-design.md`

## Global Constraints

- App name `iScanner`, slug `iscanner`, iOS `bundleIdentifier` and Android `package` = `com.dlbk.iscanner`.
- All user-facing copy is Vietnamese; button labels exactly: `Scan tài liệu`, `Gộp PDF`, `+ Chụp thêm`, `Tạo PDF`, `+ Thêm file`, `Chia sẻ`, `Đổi tên`, `Xoá`.
- iOS camera usage string exactly: `Ứng dụng cần quyền camera để scan tài liệu.`
- Install native/Expo packages with `npx expo install <pkg>` (never plain `npm install`) so versions match the SDK.
- `src/` modules must not import React Native UI components (context/hooks in `src/library/LibraryContext.tsx` and `src/workflows/useOrderedList.ts` may import `react`).
- PDF files live at `<documentDirectory>/pdfs/<id>.pdf`; index at `<documentDirectory>/library.json` shaped `{ "version": 1, "documents": DocumentMeta[] }`.
- Document names: trimmed, empty → default name, max 100 chars. Default names: `Scan dd-MM-yyyy HH.mm`, `Gộp dd-MM-yyyy HH.mm`. Displayed dates: `dd/MM/yyyy HH:mm`.
- App does not run in Expo Go; verification on device requires a development build.
- **Spec deviation (deliberate):** the spec's `src/utils/base64.ts` is dropped — the new `expo-file-system` `File` API reads/writes `Uint8Array` directly (`file.bytes()`, `file.write(bytes)`), so no base64 conversion is needed.

## Review Focus

1. **Double-tapping `Tạo PDF` / `Gộp PDF`** → exactly one document is created (Task 6 test `runs only once while busy`).
2. **Same PDF picked twice for merge** → both entries appear as separate rows and the result contains its pages twice (Task 5 test `allows duplicate values with distinct keys`; Task 6 test `merges duplicates`).
3. **Cancelling `+ Chụp thêm` after pages exist** → existing pages are kept and the screen stays open (Task 9 test `keeps pages when re-scan is cancelled`).
4. **Names containing `/`, `:`, emoji, or only whitespace** → stored verbatim (whitespace-only → default), PDF file name still `<id>.pdf` (Task 4 test `stores unsafe names verbatim and names file by id`).
5. **Document deleted (or id unknown) when the viewer opens** → "Không tìm thấy tài liệu" instead of a crash (Task 11 test `shows not-found for unknown id`).

---

## File Structure

```
app.json, package.json, tsconfig.json, jest.config.js, babel.config.js (if template has one)
app/
  _layout.tsx            Stack + GestureHandlerRootView + LibraryProvider
  index.tsx              Library (Home)
  scan.tsx               Scan review
  merge.tsx              Merge PDFs
  viewer/[id].tsx        PDF viewer
src/
  utils/format.ts        formatDate, defaultName, formatSize, sanitizeName
  pdf/images.ts          detectImageType
  pdf/createPdfFromImages.ts
  pdf/mergePdfs.ts       mergePdfs, getPdfPageCount, PdfLoadError
  library/types.ts       DocumentMeta, FsAdapter
  library/memoryFs.ts    in-memory FsAdapter (tests)
  library/expoFs.ts      FsAdapter on expo-file-system
  library/libraryStore.ts createLibraryStore
  library/LibraryContext.tsx LibraryProvider, useLibrary
  scanner/scanner.ts     scanDocuments
  native/share.ts        shareDocument
  native/pickPdfs.ts     pickPdfs
  workflows/useOrderedList.ts
  workflows/scanWorkflow.ts   createScanDocument
  workflows/mergeWorkflow.ts  loadPickedPdfs, createMergedDocument
  workflows/useBusy.ts
  components/DocumentRow.tsx
  components/NameInput.tsx
__tests__/ mirrors src/ and app/ (e.g. __tests__/pdf/mergePdfs.test.ts)
__tests__/fixtures/images.ts  makePng(w,h), makeJpeg(w,h)
```

---

### Task 1: Scaffold Expo project with config and test runner

**Files:**
- Create: project files from template at repo root (keep existing `docs/`, `requirement/`)
- Modify: `app.json`, `package.json`
- Create: `jest.config.js`, `__tests__/smoke.test.ts`, `.gitignore` (from template)

**Interfaces:**
- Produces: `npm test` (jest-expo), `npm run typecheck` (`tsc --noEmit`), `main: "expo-router/entry"`, alias none (use relative imports).

- [ ] **Step 1: Generate template in scratch dir and copy into repo root**

Run: `npx create-expo-app@latest iscanner --template blank-typescript --no-install` in a scratch directory, copy its contents (including `.gitignore`) into the repo root, then `npm install`.
Expected: `package.json` at repo root, `npx expo --version` prints a version.

- [ ] **Step 2: Install runtime dependencies**

Run: `npx expo install expo-router expo-linking expo-constants expo-status-bar react-native-safe-area-context react-native-screens expo-file-system expo-document-picker expo-sharing react-native-gesture-handler react-native-reanimated react-native-draggable-flatlist react-native-pdf react-native-blob-util react-native-document-scanner-plugin`
then `npm install pdf-lib`
then `npx expo install jest-expo jest @types/jest @testing-library/react-native -- --save-dev` and `npm install -D pngjs jpeg-js @types/pngjs @types/jpeg-js`.
Expected: install succeeds. (If reanimated's installed major requires `react-native-worklets`, `npx expo install react-native-worklets` too.)

- [ ] **Step 3: Configure `package.json` and `app.json`**

`package.json`: `"main": "expo-router/entry"`, scripts `"test": "jest"`, `"typecheck": "tsc --noEmit"`. Delete template `App.tsx` / `index.ts`.
`app.json` `expo`: `name: "iScanner"`, `slug: "iscanner"`, `scheme: "iscanner"`, `ios.bundleIdentifier` and `android.package` = `com.dlbk.iscanner`, plugins:
```json
["expo-router",
 ["react-native-document-scanner-plugin", { "cameraPermission": "Ứng dụng cần quyền camera để scan tài liệu." }],
 "expo-document-picker"]
```
`jest.config.js`: `preset: "jest-expo"`, `testMatch: ["**/__tests__/**/*.test.ts?(x)"]`, `testPathIgnorePatterns` includes `__tests__/fixtures`, and `transformIgnorePatterns` per the jest-expo docs extended with `pdf-lib|@pdf-lib|react-native-draggable-flatlist|react-native-pdf|react-native-document-scanner-plugin`.

- [ ] **Step 4: Write smoke test**

```ts
// __tests__/smoke.test.ts
import { PDFDocument } from 'pdf-lib';
test('pdf-lib loads under jest', async () => {
  const doc = await PDFDocument.create();
  doc.addPage();
  expect(doc.getPageCount()).toBe(1);
});
```

- [ ] **Step 5: Verify**

Run: `npm test` → PASS (1 test). Run: `npm run typecheck` → no errors. Run: `npx expo-doctor` → no failing checks (warnings about Expo Go are acceptable; record any others in the commit message).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold iScanner Expo app with router, deps and jest"
```

---

### Task 2: Formatting and name helpers

**Files:**
- Create: `src/utils/format.ts`
- Test: `__tests__/utils/format.test.ts`

**Interfaces:**
- Produces:
  - `formatDate(iso: string): string` → `dd/MM/yyyy HH:mm` (device local time)
  - `defaultName(kind: 'scan' | 'merge', date: Date): string` → `Scan 05-10-2026 14.03` / `Gộp 05-10-2026 14.03`
  - `formatSize(bytes: number): string` → `512 B`, `1.5 KB`, `2.3 MB` (1 decimal for KB/MB, 1024 base)
  - `sanitizeName(input: string, fallback: string): string` → trim; empty → fallback; truncate to 100 chars

- [ ] **Step 1: Write failing tests**

```ts
const d = new Date(2026, 9, 5, 14, 3); // local time
expect(formatDate(d.toISOString())).toBe('05/10/2026 14:03');
expect(defaultName('scan', d)).toBe('Scan 05-10-2026 14.03');
expect(defaultName('merge', d)).toBe('Gộp 05-10-2026 14.03');
expect(formatSize(512)).toBe('512 B');
expect(formatSize(1536)).toBe('1.5 KB');
expect(formatSize(2.3 * 1024 * 1024)).toBe('2.3 MB');
expect(sanitizeName('  Hợp đồng  ', 'X')).toBe('Hợp đồng');
expect(sanitizeName('   ', 'Scan 05-10-2026 14.03')).toBe('Scan 05-10-2026 14.03');
expect(sanitizeName('a'.repeat(150), 'X')).toHaveLength(100);
```

- [ ] **Step 2: Run** `npx jest __tests__/utils/format.test.ts` → FAIL (module not found)
- [ ] **Step 3: Implement** in `src/utils/format.ts` with manual zero-padding (no date library).
- [ ] **Step 4: Run** same command → PASS
- [ ] **Step 5: Commit** `git commit -m "feat: add format and name helpers"`

---

### Task 3: PDF creation from images and PDF merge

**Files:**
- Create: `src/pdf/images.ts`, `src/pdf/createPdfFromImages.ts`, `src/pdf/mergePdfs.ts`, `__tests__/fixtures/images.ts`
- Test: `__tests__/pdf/createPdfFromImages.test.ts`, `__tests__/pdf/mergePdfs.test.ts`

**Interfaces:**
- Produces:
  - `type ImageMime = 'image/jpeg' | 'image/png'`; `type ImageInput = { bytes: Uint8Array; mimeType: ImageMime }`
  - `detectImageType(bytes: Uint8Array): ImageMime` — throws `Error('UNSUPPORTED_IMAGE')`
  - `createPdfFromImages(images: ImageInput[]): Promise<Uint8Array>` — throws `Error('NO_IMAGES')`
  - `class PdfLoadError extends Error { index: number }` (message `PDF_LOAD_FAILED`)
  - `getPdfPageCount(pdf: Uint8Array): Promise<number>` — throws `PdfLoadError` with `index = 0`
  - `mergePdfs(pdfs: Uint8Array[]): Promise<Uint8Array>` — throws `Error('NO_PDFS')`; failing input `i` → `PdfLoadError` with `index = i`
- Fixtures: `makePng(w: number, h: number): Uint8Array` (pngjs `PNG.sync.write`), `makeJpeg(w: number, h: number): Uint8Array` (jpeg-js `encode`).

- [ ] **Step 1: Write failing tests**

`createPdfFromImages.test.ts`:
- `detects jpeg and png`: `detectImageType(makeJpeg(4,4))` → `'image/jpeg'`; `makePng` → `'image/png'`; `new Uint8Array([1,2,3,4])` throws `UNSUPPORTED_IMAGE`.
- `one page per image sized to pixels`: inputs JPEG 40×60 and PNG 30×20 → reload with `PDFDocument.load`; page count 2; `getSize()` = `{width:40,height:60}` then `{width:30,height:20}`.
- `throws on empty list`: rejects with `NO_IMAGES`.

`mergePdfs.test.ts` (build inputs with `createPdfFromImages`: A = 1 page 10×10, B = 2 pages 20×20 and 30×30):
- `merges in order`: `mergePdfs([A,B])` → 3 pages with widths `[10,20,30]`; `mergePdfs([B,A])` widths `[20,30,10]`.
- `merges duplicates`: `mergePdfs([A,A])` → 2 pages.
- `counts pages`: `getPdfPageCount(B)` → 2.
- `throws on empty list`: `NO_PDFS`.
- `reports failing index`: `mergePdfs([A, new TextEncoder().encode('garbage')])` rejects with `PdfLoadError` whose `index === 1`.
- `rejects encrypted pdf`: `jest.spyOn(PDFDocument, 'load').mockRejectedValueOnce(new EncryptedPDFError())` → `getPdfPageCount(A)` rejects with `PdfLoadError` (`index === 0`).

- [ ] **Step 2: Run** `npx jest __tests__/pdf` → FAIL
- [ ] **Step 3: Implement** — `createPdfFromImages`: `embedJpg`/`embedPng`, `addPage([img.width, img.height])`, `drawImage` at 0,0 full size, `doc.save()`. `mergePdfs`: `PDFDocument.load(bytes)` (default `ignoreEncryption: false` so encrypted files throw) wrapped in try/catch → `PdfLoadError(i)`, then `copyPages(src, src.getPageIndices())` and `addPage` each.
- [ ] **Step 4: Run** `npx jest __tests__/pdf` → PASS
- [ ] **Step 5: Commit** `git commit -m "feat: add pdf creation from images and pdf merge"`

---

### Task 4: Library store with file-system adapter

**Files:**
- Create: `src/library/types.ts`, `src/library/memoryFs.ts`, `src/library/libraryStore.ts`, `src/library/expoFs.ts`
- Test: `__tests__/library/libraryStore.test.ts`

**Interfaces:**
- Consumes: `sanitizeName`, `defaultName` (Task 2)
- Produces:
  ```ts
  type DocumentSource = 'scan' | 'merge';
  type DocumentMeta = { id: string; name: string; fileName: string; createdAt: string;
                        pageCount: number; sizeBytes: number; source: DocumentSource };
  interface FsAdapter {
    readText(path: string): Promise<string | null>;   // null if missing
    writeText(path: string, text: string): Promise<void>;
    writeBytes(path: string, bytes: Uint8Array): Promise<void>;
    readBytes(path: string): Promise<Uint8Array>;
    delete(path: string): Promise<void>;               // no-op if missing
    ensureDir(path: string): Promise<void>;
    uri(path: string): string;                         // absolute file:// URI
  }
  type LibraryStore = {
    list(): Promise<DocumentMeta[]>;                   // newest first
    get(id: string): Promise<DocumentMeta | undefined>;
    add(bytes: Uint8Array, input: { name: string; pageCount: number; source: DocumentSource }): Promise<DocumentMeta>;
    rename(id: string, name: string): Promise<DocumentMeta>;
    remove(id: string): Promise<void>;
    fileUri(meta: DocumentMeta): string;
  };
  createLibraryStore(deps: { fs: FsAdapter; now?: () => Date; newId?: () => string }): LibraryStore
  createMemoryFs(): FsAdapter & { files: Map<string, string | Uint8Array>; failNextWrite(path: string): void }
  expoFs: FsAdapter   // paths relative to Paths.document
  ```
- Paths used by the store (relative): `pdfs/<id>.pdf`, `library.json`, backup `library.json.bak`.
- `rename` with unknown id throws `Error('NOT_FOUND')`; empty name on rename falls back to the current name.

- [ ] **Step 1: Write failing tests** (memory fs, `now` stepping one minute per call, `newId` returning `id1`, `id2`, …)

- `lists empty when no index`: `list()` → `[]`.
- `adds and lists newest first`: add two docs → `list().map(d=>d.id)` = `['id2','id1']`; `id1` meta has `fileName:'id1.pdf'`, `sizeBytes` = byte length, `pageCount`, `source`; `fs.files` has `pdfs/id1.pdf`.
- `stores unsafe names verbatim and names file by id`: name `'  Hợp/đồng: 😀 '` → meta name `'Hợp/đồng: 😀'`, file key `pdfs/id1.pdf`; name `'   '` with `source:'scan'` → `defaultName('scan', now)`.
- `renames`: `rename('id1','Mới')` → `get('id1').name === 'Mới'`; `rename('nope','x')` rejects `NOT_FOUND`.
- `removes file and entry`: after `remove('id1')`, `list()` lacks it and `fs.files` lacks `pdfs/id1.pdf`.
- `recovers from corrupt index`: `files.set('library.json','{oops')` → `list()` = `[]` and `files.get('library.json.bak') === '{oops'`.
- `rolls back pdf when index write fails`: `fs.failNextWrite('library.json')`; `add(...)` rejects; `fs.files` has no `pdfs/id1.pdf`; `list()` = `[]`.
- `persists across store instances`: new store on the same fs lists the added doc.

- [ ] **Step 2: Run** `npx jest __tests__/library/libraryStore.test.ts` → FAIL
- [ ] **Step 3: Implement** `memoryFs.ts`, then `libraryStore.ts` (read index → mutate → write whole index; default `newId` = `Date.now().toString(36) + Math.random().toString(36).slice(2, 8)`). Then `expoFs.ts` using `File`, `Directory`, `Paths.document` from `expo-file-system` (`file.exists`, `file.text()`, `file.write(...)`, `file.bytes()`, `file.delete()`, `dir.create({ intermediates: true, idempotent: true })`, `file.uri`). `expoFs` is not unit-tested; it is exercised by typecheck and on device.
- [ ] **Step 4: Run** tests → PASS; `npm run typecheck` → no errors
- [ ] **Step 5: Commit** `git commit -m "feat: add JSON-indexed library store with fs adapters"`

---

### Task 5: Ordered list hook and busy guard

**Files:**
- Create: `src/workflows/useOrderedList.ts`, `src/workflows/useBusy.ts`
- Test: `__tests__/workflows/useOrderedList.test.ts`, `__tests__/workflows/useBusy.test.ts`

**Interfaces:**
- Produces:
  - `type Keyed<T> = { key: string; value: T }`
  - `useOrderedList<T>(): { items: Keyed<T>[]; append(values: T[]): void; remove(key: string): void; setOrder(items: Keyed<T>[]): void; }` — keys are unique per append (counter-based), independent of value.
  - `useBusy(): { busy: boolean; run<R>(fn: () => Promise<R>): Promise<R | undefined> }` — while a run is in flight, further `run` calls return `undefined` without calling `fn` (guard via `useRef`, not only state).

- [ ] **Step 1: Write failing tests** (`renderHook` + `act` from `@testing-library/react-native`)
- `appends and removes`: append `['a','b']`, then `['c']` → values `['a','b','c']`; remove key of `'b'` → `['a','c']`.
- `allows duplicate values with distinct keys`: append `['x','x']` → 2 items, keys differ.
- `setOrder reorders`: `setOrder([items[1], items[0]])` → values reversed.
- `runs only once while busy`: `fn` returns a promise resolved manually; call `run(fn)` twice synchronously → `fn` called once, second returns `undefined`; `busy` true until resolved, then false; after resolution `run(fn)` calls `fn` again.
- `resets busy on rejection`: `run(() => Promise.reject(new Error('x')))` rejects with `x`, then `busy` is false.

- [ ] **Step 2: Run** `npx jest __tests__/workflows/use` → FAIL
- [ ] **Step 3: Implement** both hooks.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `git commit -m "feat: add ordered list and busy guard hooks"`

---

### Task 6: Scan and merge workflows

**Files:**
- Create: `src/workflows/scanWorkflow.ts`, `src/workflows/mergeWorkflow.ts`
- Test: `__tests__/workflows/scanWorkflow.test.ts`, `__tests__/workflows/mergeWorkflow.test.ts`

**Interfaces:**
- Consumes: `detectImageType`, `createPdfFromImages`, `mergePdfs`, `getPdfPageCount`, `PdfLoadError` (Task 3); `LibraryStore`, `DocumentMeta` (Task 4).
- Produces:
  ```ts
  type ReadBytes = (uri: string) => Promise<Uint8Array>;
  createScanDocument(deps: { readBytes: ReadBytes; library: Pick<LibraryStore,'add'> },
                     imageUris: string[], name: string): Promise<DocumentMeta>
  type PickedPdf = { uri: string; name: string };
  type LoadedPdf = { uri: string; name: string; pageCount: number };
  loadPickedPdfs(deps: { readBytes: ReadBytes }, files: PickedPdf[]):
    Promise<{ loaded: LoadedPdf[]; failed: string[] }>   // failed = file names
  createMergedDocument(deps: { readBytes: ReadBytes; library: Pick<LibraryStore,'add'> },
                       files: LoadedPdf[], name: string): Promise<DocumentMeta>
  ```
- `createScanDocument` → `library.add(bytes, { name, pageCount: imageUris.length, source: 'scan' })`.
- `createMergedDocument` → `pageCount` = sum of `files[].pageCount`, `source: 'merge'`.

- [ ] **Step 1: Write failing tests** (fake `readBytes` mapping URIs to fixture bytes; fake `library.add` jest.fn returning a meta)
- `scan builds pdf in given order`: URIs `['u2','u1']` mapping to JPEG 20×20 and PNG 10×10 → bytes passed to `add` load as 2 pages with widths `[20,10]`; `add` called with `{ name:'Doc', pageCount:2, source:'scan' }`.
- `scan rejects empty`: `[]` rejects `NO_IMAGES`, `add` not called.
- `loads and reports failures`: files `[good.pdf, bad.pdf]` where bad bytes are garbage → `loaded` = `[{uri, name:'good.pdf', pageCount: N}]`, `failed` = `['bad.pdf']`.
- `merge sums pages and orders`: two loaded files (1 and 2 pages) → bytes passed to `add` have 3 pages in order; `add` called with `pageCount: 3, source: 'merge'`.
- `merges duplicates`: same loaded file twice → `pageCount` 2× and output page count 2×.
- `merge failure leaves library untouched`: `readBytes` rejects → `createMergedDocument` rejects and `add` not called.

- [ ] **Step 2: Run** `npx jest __tests__/workflows/scanWorkflow.test.ts __tests__/workflows/mergeWorkflow.test.ts` → FAIL
- [ ] **Step 3: Implement** both modules.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `git commit -m "feat: add scan and merge workflows"`

---

### Task 7: Library context and native wrappers

**Files:**
- Create: `src/library/LibraryContext.tsx`, `src/scanner/scanner.ts`, `src/native/pickPdfs.ts`, `src/native/share.ts`, `src/native/readBytes.ts`
- Test: `__tests__/library/LibraryContext.test.tsx`, `__tests__/scanner/scanner.test.ts`

**Interfaces:**
- Consumes: `LibraryStore`, `createLibraryStore`, `expoFs` (Task 4)
- Produces:
  - `LibraryProvider({ store?: LibraryStore; children })` — default store `createLibraryStore({ fs: expoFs })`; loads list on mount.
  - `useLibrary(): { documents: DocumentMeta[]; loading: boolean; store: LibraryStore; refresh(): Promise<void>; rename(id: string, name: string): Promise<void>; remove(id: string): Promise<void>; }` — `rename`/`remove` call the store then `refresh`. Screens that add documents call `store.add` via workflows then `refresh()`.
  - `scanDocuments(): Promise<string[]>` — `DocumentScanner.scanDocument({ croppedImageQuality: 90 })`; returns `scannedImages ?? []` when `status === 'success'`, else `[]`. Permission errors are rethrown as `Error('CAMERA_PERMISSION')` (match on the plugin's error message containing `permission`, case-insensitive).
  - `pickPdfs(): Promise<PickedPdf[]>` — `DocumentPicker.getDocumentAsync({ type: 'application/pdf', multiple: true, copyToCacheDirectory: true })`; cancelled → `[]`; maps assets to `{ uri, name }`.
  - `shareDocument(uri: string): Promise<void>` — `Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' })`.
  - `readBytes: ReadBytes` — `new File(uri).bytes()`.

- [ ] **Step 1: Write failing tests**
- `LibraryContext`: render a consumer under `LibraryProvider` with a store from `createLibraryStore({ fs: createMemoryFs() })` pre-populated with one doc → shows its name after load; calling `remove(id)` → doc disappears; `rename` → new name shown.
- `scanner`: `jest.mock('react-native-document-scanner-plugin')`; success with `['a','b']` → `['a','b']`; `{status:'cancel'}` → `[]`; rejection `new Error('Camera permission denied')` → rejects `CAMERA_PERMISSION`.

- [ ] **Step 2: Run** `npx jest __tests__/library/LibraryContext.test.tsx __tests__/scanner` → FAIL
- [ ] **Step 3: Implement** the five modules.
- [ ] **Step 4: Run** → PASS; `npm run typecheck` → no errors
- [ ] **Step 5: Commit** `git commit -m "feat: add library context and native wrappers"`

---

### Task 8: Root layout and Library (Home) screen

**Files:**
- Create: `app/_layout.tsx`, `app/index.tsx`, `src/components/DocumentRow.tsx`
- Test: `__tests__/app/index.test.tsx`

**Interfaces:**
- Consumes: `LibraryProvider`, `useLibrary` (Task 7); `formatDate`, `formatSize` (Task 2); `shareDocument` (Task 7)
- Produces: routes `/`, `/scan`, `/merge`, `/viewer/[id]` registered in a `Stack` with Vietnamese titles: `iScanner`, `Scan tài liệu`, `Gộp PDF`, (viewer title set by screen).

Behavior (spec §3.1): FlatList of `DocumentRow` (name; `formatDate · N trang · formatSize`). Empty state text `Chưa có tài liệu nào. Hãy scan hoặc gộp PDF để bắt đầu.` Buttons `Scan tài liệu` → `router.push('/scan')`, `Gộp PDF` → `router.push('/merge')`. Tap row → `/viewer/<id>`. Long-press → `Alert.alert(name, undefined, [Đổi tên, Chia sẻ, Xoá, Huỷ])`; `Đổi tên` opens a small modal with `NameInput` (create `src/components/NameInput.tsx`: labelled `TextInput`, props `{ value, onChangeText, placeholder }`) and `Lưu`/`Huỷ`; `Xoá` asks `Xoá tài liệu này?` with `Xoá`/`Huỷ`. Wrap root in `GestureHandlerRootView` (flex 1); call `useLibrary().refresh()` on screen focus (`useFocusEffect`).

- [ ] **Step 1: Write failing tests** (mock `expo-router`'s `router.push` and `useFocusEffect`; render `index` inside `LibraryProvider` with a memory-fs store)
- `shows empty state` when no documents.
- `lists documents with meta`: one doc (3 pages, 1536 bytes) → text containing `3 trang` and `1.5 KB`.
- `navigates`: press `Scan tài liệu` → `router.push('/scan')`; press row → `router.push('/viewer/id1')`.

- [ ] **Step 2: Run** `npx jest __tests__/app/index.test.tsx` → FAIL
- [ ] **Step 3: Implement** layout, home, `DocumentRow`, `NameInput`.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `git commit -m "feat: add root layout and library screen"`

---

### Task 9: Scan review screen

**Files:**
- Create: `app/scan.tsx`
- Test: `__tests__/app/scan.test.tsx`

**Interfaces:**
- Consumes: `scanDocuments` (Task 7), `useOrderedList<string>`, `useBusy` (Task 5), `createScanDocument` (Task 6), `readBytes`, `useLibrary` (Task 7), `defaultName`, `sanitizeName` (Task 2), `NameInput` (Task 8)

Behavior (spec §3.2): on mount call `scanDocuments()`; if it returns `[]` and the list is empty → `router.back()`. `DraggableFlatList` rows: `Trang N`, `Image` thumbnail (64×88), delete button `Xoá`; `onDragEnd={({data}) => setOrder(data)}`. `+ Chụp thêm` → `scanDocuments()` → `append`. Name input initial value `defaultName('scan', new Date())`. `Tạo PDF` disabled when 0 pages or busy; on press → `busy.run(() => createScanDocument({ readBytes, library: store }, items.map(i=>i.value), sanitizeName(name, defaultName('scan', new Date()))))` → `refresh()` → `router.replace('/viewer/<id>')`. `ActivityIndicator` while busy. Errors: `CAMERA_PERMISSION` → `Alert` `Cần quyền camera` with buttons `Mở Cài đặt` (`Linking.openSettings()`) and `Huỷ`, then `router.back()` if list empty; other failure → `Alert.alert('Không thể tạo PDF')`.

- [ ] **Step 1: Write failing tests** (mock `src/scanner/scanner`, `src/workflows/scanWorkflow`, `expo-router`; mock `react-native-draggable-flatlist` to render a plain `FlatList` that exposes `data`)
- `goes back when first scan is cancelled`: `scanDocuments` → `[]` → `router.back` called.
- `keeps pages when re-scan is cancelled`: first → `['a','b']`, second (via `+ Chụp thêm`) → `[]` → `Trang 1`, `Trang 2` still shown; `router.back` not called.
- `creates pdf and opens viewer`: press `Tạo PDF` → `createScanDocument` called with URIs `['a','b']` → `router.replace('/viewer/id1')`.
- `alerts on failure`: `createScanDocument` rejects → `Alert.alert` called with `'Không thể tạo PDF'`.

- [ ] **Step 2: Run** `npx jest __tests__/app/scan.test.tsx` → FAIL
- [ ] **Step 3: Implement** `app/scan.tsx`.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `git commit -m "feat: add scan review screen"`

---

### Task 10: Merge PDFs screen

**Files:**
- Create: `app/merge.tsx`
- Test: `__tests__/app/merge.test.tsx`

**Interfaces:**
- Consumes: `pickPdfs`, `readBytes`, `useLibrary` (Task 7), `loadPickedPdfs`, `createMergedDocument`, `LoadedPdf` (Task 6), `useOrderedList<LoadedPdf>`, `useBusy` (Task 5), `defaultName`, `sanitizeName` (Task 2), `NameInput` (Task 8)

Behavior (spec §3.3): on mount `pickPdfs()` → `loadPickedPdfs` → `append(loaded)`; if `failed.length` → `Alert.alert('Không đọc được file', failed.join('\n') + '\nFile có thể bị hỏng hoặc có mật khẩu.')`; if nothing picked/loaded and list empty → `router.back()`. Rows: file name, `N trang`, `Xoá`. `+ Thêm file` repeats pick/load/append. Name default `defaultName('merge', new Date())`. `Gộp PDF` enabled only when `items.length >= 2` and not busy → `busy.run(createMergedDocument(...))` → `refresh()` → `router.replace('/viewer/<id>')`; failure → `Alert.alert('Không thể tạo PDF')`. Show a hint `Chọn ít nhất 2 file PDF` when fewer than 2.

- [ ] **Step 1: Write failing tests** (mocks as in Task 9 for `pickPdfs`, `mergeWorkflow`)
- `goes back when pick is cancelled`: `pickPdfs` → `[]` → `router.back`.
- `disables merge with one file`: one loaded file → `Gộp PDF` button disabled and hint shown.
- `reports failed files`: `loadPickedPdfs` → `{loaded:[a,b], failed:['x.pdf']}` → `Alert.alert` called with `'Không đọc được file'` and a message containing `x.pdf`; rows for `a`, `b` shown.
- `merges and opens viewer`: two loaded → press `Gộp PDF` → `createMergedDocument` called with files in list order → `router.replace('/viewer/id1')`.

- [ ] **Step 2: Run** `npx jest __tests__/app/merge.test.tsx` → FAIL
- [ ] **Step 3: Implement** `app/merge.tsx`.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `git commit -m "feat: add merge PDFs screen"`

---

### Task 11: Viewer screen and final verification

**Files:**
- Create: `app/viewer/[id].tsx`, `README.md`
- Test: `__tests__/app/viewer.test.tsx`

**Interfaces:**
- Consumes: `useLibrary` (Task 7), `shareDocument` (Task 7)

Behavior (spec §3.4): read `id` via `useLocalSearchParams`; find in `documents` (after `loading` is false). Found → `Stack.Screen options={{ title: doc.name, headerRight: Chia sẻ button }}` and `<Pdf source={{ uri: store.fileUri(doc) }} style={{ flex: 1 }} />` from `react-native-pdf`. Not found → text `Không tìm thấy tài liệu` and a `Quay lại` button (`router.back()`).

- [ ] **Step 1: Write failing tests** (`jest.mock('react-native-pdf', ...)` to a stub component capturing `source`)
- `shows not-found for unknown id`: params `{id:'nope'}` → `Không tìm thấy tài liệu`.
- `renders pdf for known id`: stub receives `source.uri === store.fileUri(doc)`; pressing `Chia sẻ` calls `shareDocument` with that URI (mock `src/native/share`).

- [ ] **Step 2: Run** `npx jest __tests__/app/viewer.test.tsx` → FAIL
- [ ] **Step 3: Implement** the viewer.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Write `README.md`** (Vietnamese): features; requirement that Expo Go is not supported; commands `npm test`, `npm run typecheck`; dev build steps: `npx expo run:android` (needs Android SDK) or `npx eas-cli build --profile development --platform android|ios`; manual test checklist copied from spec §8 "Manual".
- [ ] **Step 6: Full verification**

Run: `npm test` → all suites PASS.
Run: `npm run typecheck` → no errors.
Run: `npx expo-doctor` → no failing checks.
Run: `npx expo export --platform android --output-dir %TEMP%/iscanner-export` (or any scratch dir) → bundle succeeds (proves all imports resolve in the Metro bundle).

- [ ] **Step 7: Commit** `git commit -m "feat: add pdf viewer screen and README"`
