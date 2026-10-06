# Page Editor, Better Crop & Full HD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users re-crop (perspective), rotate, retake and align each scanned page, place pages on A4/Letter with margins, and store every page as a sharpened JPEG with long edge ≤ 1920 px.

**Architecture:** Pure, unit-tested math (`src/pdf/layout.ts`, `src/imaging/geometry.ts`) drives both PDF generation and the editor preview. Native image work sits behind two thin wrappers — `src/native/opencv.ts` (react-native-fast-opencv) and `src/imaging/enhance.ts` (+ expo-image-manipulator) — which screens/tests mock. The editor is a full-screen Modal component used by `app/scan.tsx`.

**Tech Stack:** existing Expo SDK 57 / RN 0.86 / TS app; add `react-native-fast-opencv@^1.0.1`, `expo-image-manipulator` (SDK-matched); gesture-handler + reanimated (already installed); jest-expo + RNTL v14.

**Spec:** `docs/superpowers/specs/2026-10-06-page-editor-design.md`

## Global Constraints

- Branch `feat/page-editor`. Routes stay in root `app/`; `src/` has no React Native UI imports except components in `src/components/` and hooks/context already there.
- Vietnamese copy, exactly: `Khổ giấy`, `A4`, `Letter`, `Theo ảnh`, `Lề`, `Không`, `Nhỏ`, `Vừa`, `Trên`, `Giữa`, `Dưới`, `Lấp đầy`, `Sửa`, `Xoá`, `Huỷ`, `Xong`, `Trang N`, `Tự cắt sát`, `Toàn ảnh`, `Xoay ⟳`, `Chụp lại`, `Đang xử lý ảnh…`, `Không xử lý được ảnh`.
- Defaults: layout `{ pageSize: 'a4', margin: 'medium' }`, page align `'center'`.
- Sizes: A4 595.28 × 841.89 pt; Letter 612 × 792 pt; margins none 0 / small 14.17 pt (5 mm) / medium 28.35 pt (10 mm).
- Image normalization: long edge ≤ **1920** px (downscale only), JPEG compress **0.95**; scanner `croppedImageQuality: 100`.
- Detection: run on a copy with long edge 800 px; accept largest 4-vertex polygon with area ≥ **20 %** of image; Canny(75, 200); approxPolyDP epsilon 0.02 × perimeter; unsharp = 1.5·img − 0.5·GaussianBlur(σ 1.0).
- Install with `npx expo install expo-image-manipulator` and `npm install react-native-fast-opencv@^1.0.1`. Tests mock both packages through the wrappers; never import them directly from screens.
- RNTL v14: `render`, `renderHook`, `act`, `fireEvent` are async — always `await`. Mock `react-native-document-scanner-plugin` with a factory.
- Stage only files you changed (`git add <paths>`); never commit `docs/claude-memory/` or `.gitignore` changes you didn't make.

## Review Focus

1. **User drags corners so the quad self-intersects (e.g. TL dragged past BR)** → `Xong` must still produce a correct, non-mirrored crop: the editor passes `orderQuad(corners)` to `applyEdit` (Task 2 test `orders crossed corners`; Task 5 test `orders crossed corners before applying`).
2. **User collapses the corners into a tiny area** → `Xong` must not crash or produce a 0-px image: `isQuadUsable` (area ≥ 5 % of image) gates `Xong`; unusable → alert `Không xử lý được ảnh` (Task 2 tests for `isQuadUsable`; Task 5 test `blocks done on unusable quad`).
3. **Retake, then cancel the editor** → original page kept and the retaken file deleted (Task 5 test `cancel after retake keeps original and deletes retaken file`).
4. **Portrait page rotated 90°** → resulting landscape image gets a landscape A4 page (Task 1 test `landscape image gets landscape page`; baked rotation makes this automatic).
5. **Normalizing one page fails right after a multi-page scan** → the other pages still normalize and the failed one keeps its raw image (Task 6 test `keeps raw page when normalize fails`).

---

### Task 1: PDF page layout math and layout-aware PDF creation

**Files:**
- Create: `src/pdf/layout.ts`
- Modify: `src/pdf/createPdfFromImages.ts`, `src/workflows/scanWorkflow.ts`
- Test: `__tests__/pdf/layout.test.ts`, `__tests__/pdf/createPdfFromImages.test.ts`, `__tests__/workflows/scanWorkflow.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PageSize = 'a4' | 'letter' | 'image';
  export type Margin = 'none' | 'small' | 'medium';
  export type Align = 'top' | 'center' | 'bottom' | 'fill';
  export type PageLayout = { pageSize: PageSize; margin: Margin };
  export const DEFAULT_LAYOUT: PageLayout;            // { pageSize: 'a4', margin: 'medium' }
  export type Placement = { pageWidth: number; pageHeight: number; x: number; y: number; width: number; height: number };
  export function computePlacement(img: { width: number; height: number }, layout: PageLayout, align: Align): Placement;
  // createPdfFromImages.ts
  export type PageImage = ImageInput & { align: Align };
  export function createPdfFromImages(images: PageImage[], layout?: PageLayout): Promise<Uint8Array>; // default { pageSize:'image', margin:'none' }
  // scanWorkflow.ts
  export function createScanDocument(deps, pages: { uri: string; align: Align }[], name: string, layout: PageLayout): Promise<DocumentMeta>;
  ```
- Placement rules (spec §3.1): PDF origin bottom-left; `image` → page = image px, rect = full page; landscape image (w > h) → swap page dims; `fill` → cover whole page, centred (rect may exceed page); others → fit printable area (page − 2·margin each axis), centred horizontally; `top` → rect top at `pageHeight − margin`; `bottom` → `y = margin`; `center` → vertically centred.

- [ ] **Step 1: Write failing tests** (`toBeCloseTo(…, 1)` for floats)
  - `image mode keeps pixel page`: 800×600, `{image, medium}`, `center` → `{pageWidth:800,pageHeight:600,x:0,y:0,width:800,height:600}`.
  - `A4 portrait fit centre with medium margin`: 1000×2000 → page 595.28×841.89; printable 538.58×785.19; scale = min(538.58/1000, 785.19/2000)=0.3926 → width 392.6, height 785.19, x = (595.28−392.6)/2, y = 28.35.
  - `landscape image gets landscape page`: 2000×1000, `{a4, none}` → pageWidth 841.89, pageHeight 595.28.
  - `top and bottom alignment`: 1000×500 on `{a4, medium}` portrait → `top`: `y + height` = 841.89 − 28.35; `bottom`: `y` = 28.35.
  - `small image is scaled up to fit`: 100×100 `{letter, small}` → width = height = 612 − 2·14.17.
  - `fill covers page ignoring margins`: 1000×1000 `{a4, medium}` `fill` → width = height = 841.89; x = (595.28 − 841.89)/2; y = 0.
  - `DEFAULT_LAYOUT is A4 medium`.
  - In `createPdfFromImages.test.ts` add `uses layout page size and placement`: one JPEG 400×800 with align `center`, layout `{a4, medium}` → reloaded page size 595.28×841.89. Existing tests keep passing with no layout argument (update calls to pass `align: 'center'` in each image).
  - In `scanWorkflow.test.ts` update existing tests to the new signature (`pages: [{uri, align:'center'}]`, layout `{pageSize:'image', margin:'none'}`) and add `forwards layout`: layout `{a4, small}` → PDF page width 595.28.
- [ ] **Step 2: Run** `npx jest __tests__/pdf __tests__/workflows/scanWorkflow.test.ts` → FAIL (module missing / signature).
- [ ] **Step 3: Implement** `layout.ts`; make `createPdfFromImages` add the page `[pageWidth, pageHeight]` and `drawImage` at `{x,y,width,height}` from `computePlacement`; update `createScanDocument` and its only caller `app/scan.tsx` minimally (`items.map(i => ({ uri: i.value, align: 'center' }))`, `DEFAULT_LAYOUT`) so typecheck passes — full UI comes in Task 7.
- [ ] **Step 4: Run** the same tests → PASS; `npm test` and `npm run typecheck` green.
- [ ] **Step 5: Commit** `git commit -m "feat: A4/Letter page layout with margins and alignment for scanned PDFs"`

---

### Task 2: Quad geometry helpers

**Files:**
- Create: `src/imaging/geometry.ts`
- Test: `__tests__/imaging/geometry.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Point = { x: number; y: number };
  export type Quad = [Point, Point, Point, Point];          // TL, TR, BR, BL
  export function orderQuad(points: Point[]): Quad;          // exactly 4 points; TL = min(x+y), BR = max(x+y), TR = min(y−x), BL = max(y−x)
  export function fullQuad(w: number, h: number): Quad;      // (0,0),(w,0),(w,h),(0,h)
  export function clampQuad(q: Quad, w: number, h: number): Quad;
  export function quadArea(q: Quad): number;                 // shoelace, absolute
  export function warpSize(q: Quad): { width: number; height: number }; // round(max(|TR−TL|,|BR−BL|)), round(max(|BL−TL|,|BR−TR|))
  export function isFullQuad(q: Quad, w: number, h: number, tolerancePx?: number): boolean; // default 2
  export function isQuadUsable(q: Quad, w: number, h: number): boolean;   // quadArea(orderQuad) ≥ 5 % of w·h
  export function scaleQuad(q: Quad, factor: number): Quad;
  ```

- [ ] **Step 1: Write failing tests**
  - `orderQuad sorts shuffled points`: `[(90,95),(10,5),(5,90),(100,8)]` → TL (10,5), TR (100,8), BR (90,95), BL (5,90).
  - `orders crossed corners` (Review Focus 1): corners `[(100,100),(0,0),(100,0),(0,100)]` given as TL..BL → `orderQuad` returns `fullQuad(100,100)`.
  - `fullQuad`, `clampQuad` (point (−5, 120) on 100×100 → (0,100)), `quadArea(fullQuad(100,50)) = 5000`.
  - `warpSize` for trapezoid TL(10,0) TR(90,0) BR(100,50) BL(0,50) → `{width:100, height:51}` (round of √(10²+50²)=50.99).
  - `isFullQuad` true within 2 px, false at 3 px.
  - `isQuadUsable`: full quad true; 20×20 quad in 100×100 (4 %) false; 25×25 (6.25 %) true.
  - `scaleQuad` doubles coordinates.
- [ ] **Step 2: Run** `npx jest __tests__/imaging/geometry.test.ts` → FAIL
- [ ] **Step 3: Implement** `geometry.ts`.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `git commit -m "feat: quad geometry helpers for page cropping"`

---

### Task 3: Native image wrappers — OpenCV detection/warp and Full HD normalization

**Files:**
- Modify: `package.json`, `package-lock.json`, `jest.config.js` (only if transformIgnorePatterns needs the new packages)
- Create: `src/native/opencv.ts`, `src/imaging/enhance.ts`
- Modify: `src/scanner/scanner.ts`
- Test: `__tests__/imaging/enhance.test.ts`, `__tests__/scanner/scanner.test.ts`

**Interfaces:**
- Consumes: `Quad`, `orderQuad`, `scaleQuad`, `fullQuad`, `quadArea`, `warpSize` (Task 2).
- Produces:
  ```ts
  // src/native/opencv.ts  (synchronous JSI calls; release every Mat)
  export function detectQuad(base64Jpeg: string, width: number, height: number): Quad | null;
  export function warpAndSharpen(base64Jpeg: string, quad: Quad, rotation: Rotation): string; // base64 JPEG/PNG
  export type Rotation = 0 | 90 | 180 | 270;
  // src/imaging/enhance.ts
  export const MAX_EDGE = 1920;
  export const JPEG_QUALITY = 0.95;
  export type ImageSize = { width: number; height: number };
  export function targetSize(size: ImageSize): ImageSize;          // pure: scale so long edge ≤ 1920, never up; rounded
  export function normalizePage(uri: string): Promise<string>;     // sharpen (full quad, rot 0) → resize(targetSize) → JPEG 0.95 → new cache file uri
  export function applyEdit(uri: string, edit: { quad: Quad; rotation: Rotation }): Promise<string>; // warpAndSharpen(quad, rotation) → resize → JPEG 0.95
  export function detectPageQuad(uri: string): Promise<{ quad: Quad; size: ImageSize; detected: boolean }>; // reads file, downscales to 800 long edge for detection, scales quad back; fallback fullQuad, detected=false
  // src/scanner/scanner.ts
  export function scanDocuments(options?: { maxPages?: number }): Promise<string[]>;  // croppedImageQuality 100; maxNumDocuments = maxPages when given
  ```
- Implementation notes: read/write files with expo-file-system `File` (`base64()` / write base64) and `expo-image-manipulator` (`ImageManipulator.manipulate(uri).resize(...).renderAsync()` then `saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG })` — use whichever API the installed SDK 57 version exports; check its `.d.ts`). OpenCV: use the package's `OpenCV` object / `Mat.createFromBase64`, `toBase64`; check its typings for exact names and for how to call `findContours`/`approxPolyDP`/`addWeighted` (if `addWeighted` is not exported, implement unsharp with `GaussianBlur` + `subtract`/`add` or the closest exported ops and say so in the report).

- [ ] **Step 1: Install** `npx expo install expo-image-manipulator` and `npm install react-native-fast-opencv@^1.0.1`; read `node_modules/react-native-fast-opencv/README.md` for setup; run `npm test` + `npm run typecheck` to confirm nothing broke.
- [ ] **Step 2: Write failing tests** (`jest.mock('../../src/native/opencv')`, `jest.mock('expo-image-manipulator', factory)`, `jest.mock('expo-file-system', factory)` with in-memory base64 files)
  - `targetSize`: 4000×3000 → 1920×1440; 3000×4000 → 1440×1920; 1280×960 → unchanged; 1920×1080 → unchanged.
  - `normalizePage downsizes large images`: manipulator reports 4000×3000 → resize called with `{ width: 1920 }` (or 1920×1440) and save with `compress: 0.95`, JPEG; returns a new uri ≠ input.
  - `normalizePage keeps small images size`: 1280×960 → no resize call; still saved at 0.95.
  - `normalizePage sharpens with full quad`: `warpAndSharpen` called with `fullQuad(w,h)` and rotation 0.
  - `applyEdit passes quad and rotation`: quad Q, rotation 90 → `warpAndSharpen(…, Q, 90)`; output saved at 0.95.
  - `detectPageQuad scales detection back`: image 4000×3000, mocked `detectQuad` returns quad on the 800×600 copy → result quad ×5; `detected: true`. Null → `fullQuad(4000,3000)`, `detected: false`.
  - `scanner passes quality 100 and maxPages`: `scanDocuments({ maxPages: 1 })` → plugin called with `{ croppedImageQuality: 100, maxNumDocuments: 1 }`; no options → `{ croppedImageQuality: 100 }` (update existing scanner test expecting 90).
- [ ] **Step 3: Run** `npx jest __tests__/imaging/enhance.test.ts __tests__/scanner` → FAIL
- [ ] **Step 4: Implement** `opencv.ts` (per spec §3.4 and the constraint values), `enhance.ts`, scanner change.
- [ ] **Step 5: Run** → PASS; `npm test`, `npm run typecheck`, `npx expo-doctor` green.
- [ ] **Step 6: Commit** `git commit -m "feat: OpenCV crop detection/warp and Full HD JPEG normalization"`

---

### Task 4: Editable ordered list

**Files:**
- Modify: `src/workflows/useOrderedList.ts`
- Test: `__tests__/workflows/useOrderedList.test.ts`

**Interfaces:**
- Produces: `update(key: string, value: T): void` on the `useOrderedList<T>()` result (unknown key → no-op).

- [ ] **Step 1: Write failing tests** `update replaces value in place`: append `['a','b','c']`, `update(key of 'b', 'B')` → values `['a','B','c']`, keys unchanged. `update unknown key is a no-op`.
- [ ] **Step 2: Run** `npx jest __tests__/workflows/useOrderedList.test.ts` → FAIL
- [ ] **Step 3: Implement** `update` (memoised like the other callbacks).
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `git commit -m "feat: in-place update for ordered list items"`

---

### Task 5: Page editor component

**Files:**
- Create: `src/components/PageEditor.tsx`, `src/components/CornerHandles.tsx`, `src/components/PagePreview.tsx`
- Test: `__tests__/components/PageEditor.test.tsx`, `__tests__/components/PagePreview.test.tsx`

**Interfaces:**
- Consumes: `Align`, `PageLayout`, `computePlacement` (Task 1); `Quad`, `orderQuad`, `fullQuad`, `clampQuad`, `isFullQuad`, `isQuadUsable` (Task 2); `detectPageQuad`, `applyEdit`, `Rotation` (Task 3); `deleteFiles` (existing `src/native/deleteFiles.ts`).
- Produces:
  ```ts
  export type ScanPage = { uri: string; align: Align };
  type PageEditorProps = {
    visible: boolean; page: ScanPage; pageNumber: number; layout: PageLayout;
    onCancel: () => void;
    onDone: (page: ScanPage) => void;          // new uri (processed) or same uri, plus align
    onRetake: () => Promise<string | null>;     // returns a new normalized image uri or null if cancelled
  };
  export function PageEditor(props: PageEditorProps): JSX.Element;
  // CornerHandles: { imageRect: {x,y,width,height}; imageSize: {width,height}; quad: Quad; onChange(q: Quad): void } — 4 Gesture.Pan handles (testID corner-0..3), clamps via clampQuad, draws the quad outline, magnifier while dragging
  // PagePreview: { layout: PageLayout; align: Align; imageSize: {width,height} } — paper outline + margin + image rect from computePlacement (testID page-preview-image with style left/top/width/height in preview px)
  ```
- Behaviour per spec §4.2: on open/when `page.uri` changes → `Image.getSize` + `detectPageQuad`; toolbar `Tự cắt sát` (re-detect), `Toàn ảnh` (fullQuad), `Xoay ⟳` (rotation (r+90)%360, image preview rotated), `Chụp lại` (`onRetake`; new uri → reload, reset rotation; remember it as `retakenUri`); align row `Trên/Giữa/Dưới/Lấp đầy`; `Xong`: if `!isQuadUsable` → `Alert.alert('Không xử lý được ảnh')`; if `isFullQuad` && rotation 0 → `onDone({ uri: currentUri, align })`; else spinner, `applyEdit(currentUri, { quad: orderQuad(quad), rotation })` → `onDone({ uri: newUri, align })`; failure → alert, stay open. `Huỷ`/back → delete `retakenUri` if any, `onCancel()`.

- [ ] **Step 1: Write failing tests** (mock `src/imaging/enhance`, `src/native/deleteFiles`, `Image.getSize` → 1000×1500; render with `layout {a4, medium}`, page `{uri:'p1', align:'center'}`)
  - `cancel makes no change`: press `Huỷ` → `onCancel` called, `onDone`/`applyEdit` not called.
  - `done without edits returns same uri with new align`: press `Lấp đầy` then `Xong` → `onDone({uri:'p1', align:'fill'})`, `applyEdit` not called (detectPageQuad mocked to return fullQuad, detected false).
  - `done after rotate applies edit`: press `Xoay ⟳`, `Xong` → `applyEdit('p1', {quad: fullQuad(1000,1500), rotation: 90})`, `onDone({uri:'p1-edited', align:'center'})`.
  - `orders crossed corners before applying` (Review Focus 1): detectPageQuad returns a crossed quad (TL/BR swapped) with detected true → `Xong` → `applyEdit` receives `orderQuad(thatQuad)`.
  - `blocks done on unusable quad` (Review Focus 2): detectPageQuad returns a 10×10 quad → `Xong` → `Alert.alert('Không xử lý được ảnh')`, `onDone` not called.
  - `failure alerts and stays open`: `applyEdit` rejects → alert `Không xử lý được ảnh`, `onDone` not called.
  - `retake replaces image`: `onRetake` resolves `'p2'` → detectPageQuad called with `'p2'`; `Xong` (no edits) → `onDone({uri:'p2', …})`.
  - `cancel after retake keeps original and deletes retaken file` (Review Focus 3): retake → `'p2'`, `Huỷ` → `deleteFiles(['p2'])`, `onCancel`.
  - `Tự cắt sát re-runs detection`, `Toàn ảnh resets corners` (assert via detectPageQuad call count and the applyEdit quad after a rotate).
  - `PagePreview`: A4 medium, image 1000×2000, preview width 120 → `page-preview-image` width ≈ 120·392.6/595.28 (±1).
- [ ] **Step 2: Run** `npx jest __tests__/components` → FAIL
- [ ] **Step 3: Implement** the three components (Modal `animationType="slide"`, `onRequestClose` = cancel; handles 32 dp touch targets; magnifier 96 dp circle at top-left showing the image region under the active handle at 2×).
- [ ] **Step 4: Run** → PASS; `npm test`, `npm run typecheck` green.
- [ ] **Step 5: Commit** `git commit -m "feat: page editor with corner crop, rotate, retake and alignment preview"`

---

### Task 6: Scan review screen integration

**Files:**
- Modify: `app/scan.tsx`
- Create: `src/components/SegmentedControl.tsx`
- Test: `__tests__/app/scan.test.tsx`

**Interfaces:**
- Consumes: `ScanPage`, `PageEditor` (Task 5); `useOrderedList<ScanPage>().update` (Task 4); `normalizePage` (Task 3); `scanDocuments({maxPages})` (Task 3); `DEFAULT_LAYOUT`, `PageLayout`, `Align` (Task 1); `createScanDocument(deps, pages, name, layout)` (Task 1); `deleteFiles`.
- Produces: `SegmentedControl<T extends string>({ label, options: {value: T; label: string}[], value, onChange, disabled? })` with `accessibilityRole="button"` and `accessibilityState={{ selected, disabled }}` per option.
- Behaviour per spec §4.1: after every scan/`+ Chụp thêm` → overlay `Đang xử lý ảnh…` while `normalizePage` runs sequentially over new URIs; append `{uri: normalized, align: 'center'}`; delete raw scanner files that were successfully normalized; on failure keep the raw uri for that page. Rows show thumbnail (press → editor), `Trang N`, align label, `Sửa`, `Xoá`. Segmented `Khổ giấy` (A4/Letter/Theo ảnh) and `Lề` (Không/Nhỏ/Vừa; disabled when Theo ảnh). Editor `onDone` → `update(key, page)` and delete the old uri if it changed; `onRetake` → `scanDocuments({maxPages:1})` → first uri normalized (delete extras/raw) → returned. `Tạo PDF` → `createScanDocument(deps, items.map(i => i.value), name, layout)`. Unmount/success cleanup deletes all page uris (existing logic, now `i.value.uri`).

- [ ] **Step 1: Write failing tests** (extend existing mocks; mock `src/imaging/enhance` with `normalizePage: uri => Promise.resolve(uri + '-n')`, mock `src/components/PageEditor` to a stub exposing its props)
  - `normalizes scanned pages with overlay`: scan → `['a','b']` → `Đang xử lý ảnh…` visible while pending; then rows `Trang 1`, `Trang 2`; `deleteFiles` called with `['a','b']`.
  - `keeps raw page when normalize fails` (Review Focus 5): `normalizePage` rejects for `'b'` → two rows; `createScanDocument` later receives uris `['a-n','b']`; `deleteFiles` not called with `'b'`.
  - `layout controls change PDF layout`: press `Letter`, press `Nhỏ` → `Tạo PDF` → `createScanDocument` 4th arg `{pageSize:'letter', margin:'small'}`; pressing `Theo ảnh` marks `Không`/`Nhỏ`/`Vừa` disabled.
  - `Sửa opens editor for that page`: press second `Sửa` → editor stub `visible` with `page.uri === 'b-n'`, `pageNumber 2`.
  - `editor done updates page in place`: stub calls `onDone({uri:'b-edit', align:'top'})` → second row shows `Trên`; `createScanDocument` receives `[{uri:'a-n',align:'center'},{uri:'b-edit',align:'top'}]`; `deleteFiles` called with `['b-n']`.
  - `retake returns normalized single page`: stub calls `onRetake()` → `scanDocuments` called with `{maxPages:1}`, resolves `['r1','r2']` → returns `'r1-n'`; `deleteFiles` called with `['r2']` and `['r1']`.
  - Update existing scan tests for the new item shape (they must still pass).
- [ ] **Step 2: Run** `npx jest __tests__/app/scan.test.tsx` → FAIL
- [ ] **Step 3: Implement** `SegmentedControl` and the `app/scan.tsx` changes.
- [ ] **Step 4: Run** → PASS; `npm test`, `npm run typecheck` green.
- [ ] **Step 5: Commit** `git commit -m "feat: scan review with Full HD normalization, page editor and PDF layout options"`

---

### Task 7: Native build and device verification (controller runs this on the emulator)

**Files:**
- Modify: `README.md` (feature list + manual checklist), `docs/superpowers/progress/2026-10-06-page-editor.md` (create: progress log)

- [ ] **Step 1:** `npx expo prebuild --platform android` (regenerates `android/` with the new native modules), build/install the debug app on AVD `iscanner_pixel` (`npx expo run:android --no-bundler --device iscanner_pixel`), start Metro.
- [ ] **Step 2: Verify on device**, recording screenshots/results:
  - scan 2 pages → overlay appears → rows show; pull a page file (`adb shell run-as com.dlbk.iscanner …`) and check its long edge ≤ 1920 (e.g. `file`/`identify`-equivalent or decode header in node).
  - `Sửa` → corners detected; drag a corner; `Xoay ⟳`; `Xong` → thumbnail updated.
  - `Tự cắt sát`, `Toàn ảnh`, `Chụp lại` work; `Huỷ` after `Chụp lại` keeps the original.
  - `Khổ giấy A4` + `Lề Vừa` + one page `Lấp đầy`, one `Trên` → `Tạo PDF` → viewer shows A4 pages with margins and the chosen alignment.
- [ ] **Step 3:** Build release APK as in the MVP progress log (`./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a`), copy to `dist/iScanner-1.1.0.apk` after bumping `app.json` `version` to `1.1.0`; record size vs 1.0.0 (63 MB).
- [ ] **Step 4:** Update README (features + manual checklist) and the progress log; run `npm test`, `npm run typecheck`; commit `git commit -m "docs: page editor device verification and release notes"`.
