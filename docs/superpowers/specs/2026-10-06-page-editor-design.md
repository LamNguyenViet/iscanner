# iScanner — Page Editor, Better Crop & Full HD — Design Spec

- **Date:** 2026-10-06 (sequence 1)
- **Source:** `requirement/requirement.txt` (entry "06/10/2026 - sequence 1")
- **Builds on:** `docs/superpowers/specs/2026-10-05-camscanner-mvp-design.md` (MVP, merged into `master`)
- **Status:** Draft — awaiting user review

## 1. Goal

Requirement (translated): *"Add the ability to edit the position of captured images for PDF merging; find libraries that crop scans more accurately (no excess border); images must be sharper, Full HD resolution."*

Decisions made with the user:

| Topic | Decision |
|---|---|
| "Edit position" means | **B** — re-adjust crop corners / rotate / retake an individual page after scanning, **and C** — place the image on a PDF page (paper size, margins, per-page alignment) |
| Full HD | Normalize every scanned page so its long edge is **at most 1920 px** (downscale + sharpen when larger, never upscale), JPEG quality **95** |
| Page layout | Per-document paper size **A4 / Letter / Theo ảnh** and margin **Không / Nhỏ / Vừa**, plus per-page alignment **Trên / Giữa / Dưới / Lấp đầy** |
| Approach | Keep the ML Kit / VisionKit scanner; add an in-app page editor using **`react-native-fast-opencv`** (edge detection + perspective warp + sharpen) and **`expo-image-manipulator`** (resize + JPEG encode) |

### Library research (npm, 2026-10-06)

| Library | Version / last publish | Verdict |
|---|---|---|
| `react-native-document-scanner-plugin` (current) | 2.0.4 / 2026-01 | Keep for capture (ML Kit FULL mode, VisionKit) |
| `react-native-fast-opencv` | 1.0.1 / 2026-08 | **Use** — JSI, New Architecture only (RN ≥ 0.85; app is 0.86). Exposes `GaussianBlur`, `Canny`, `findContours`, `approxPolyDP`, `getPerspectiveTransform`, `warpPerspective`, `resize`, `Mat.createFromBase64`, `toBase64` |
| `expo-image-manipulator` | 57.0.20 / 2026-10 | **Use** — resize / rotate / JPEG compress with quality |
| `@dariyd/react-native-document-scanner` | 2.1.1 / 2026-09 | Same ML Kit/VisionKit engines as current plugin → no crop-quality gain; not adopted |
| `react-native-perspective-image-cropper`, `react-native-image-crop-tools` | 2022 / 2023 | Unmaintained — rejected |
| Commercial SDKs (Scanbot, Dynamsoft, Genius Scan) | — | Best quality but paid licenses — rejected |

**Constraint:** ML Kit and VisionKit return only the *already cropped* image. In-app editing can therefore only crop **tighter** (remove excess) and rotate; when the scanner cut into the content, the user uses **"Chụp lại"** (retake that page).

### Out of scope
Editing pages of imported PDFs in the merge flow (unchanged), colour filters (scanner already offers them), OCR, undo history inside the editor, pinch-zoom of the image in the editor (a corner magnifier is provided instead).

## 2. Data model

```ts
// src/pdf/layout.ts
type PageSize = 'a4' | 'letter' | 'image';
type Margin = 'none' | 'small' | 'medium';      // 0 / 5 mm / 10 mm
type Align = 'top' | 'center' | 'bottom' | 'fill';
type PageLayout = { pageSize: PageSize; margin: Margin };
const DEFAULT_LAYOUT: PageLayout = { pageSize: 'a4', margin: 'medium' };

// review-list item (app/scan.tsx)
type ScanPage = { uri: string; align: Align };    // default align 'center'
```

- Crop and rotation are **baked** into a new image file when the editor is confirmed; the page then points at the new file and the old file is deleted. No crop/rotation metadata is stored.
- Points: A4 = 595.28 × 841.89 pt, Letter = 612 × 792 pt; 1 mm = 2.8346 pt (small = 14.17 pt, medium = 28.35 pt).

## 3. Modules

### 3.1 `src/pdf/layout.ts` (pure)
```ts
computePlacement(img: { width: number; height: number }, layout: PageLayout, align: Align):
  { pageWidth: number; pageHeight: number; x: number; y: number; width: number; height: number }
```
- `pageSize: 'image'` → page = image size, image at (0,0) full size; margin and align ignored (previous behaviour).
- Otherwise orientation per image: landscape image (width > height) → landscape page (dimensions swapped).
- `align: 'fill'` → image scaled to **cover** the whole page (margins ignored), centred; overflow is clipped by the page.
- Other aligns → image scaled to **fit** inside the printable area (page minus margins on all sides), keeping aspect ratio; scaled **down or up** to fit width or height (whichever binds). Horizontally centred; vertically top / centre / bottom of the printable area. (PDF y-axis origin is bottom-left.)

### 3.2 `src/pdf/createPdfFromImages.ts` (changed)
```ts
type PageImage = ImageInput & { align: Align };
createPdfFromImages(images: PageImage[], layout?: PageLayout): Promise<Uint8Array>   // layout default = { pageSize: 'image', margin: 'none' }
```
Default keeps old callers/tests valid; the scan workflow passes the user's layout.

### 3.3 `src/imaging/geometry.ts` (pure)
```ts
type Point = { x: number; y: number };
type Quad = [Point, Point, Point, Point];   // TL, TR, BR, BL
orderQuad(points: Point[]): Quad            // sorts any 4 points into TL,TR,BR,BL
fullQuad(w: number, h: number): Quad
clampQuad(q: Quad, w: number, h: number): Quad
quadArea(q: Quad): number                   // shoelace
warpSize(q: Quad): { width: number; height: number }   // max of opposite edge lengths, rounded
isFullQuad(q: Quad, w: number, h: number, tolerancePx = 2): boolean
```

### 3.4 `src/native/opencv.ts` (thin wrapper, mocked in tests)
```ts
detectQuad(base64Jpeg: string, width: number, height: number): Quad | null
warpAndSharpen(base64Jpeg: string, quad: Quad, rotation: 0 | 90 | 180 | 270): string   // returns base64 image
```
- `detectQuad`: grayscale → GaussianBlur 5×5 → Canny(75, 200) → findContours (external) → for each contour `approxPolyDP(0.02 × perimeter)`; take the largest 4-vertex polygon whose `quadArea ≥ 20 %` of the image; return `orderQuad(...)`, else `null`. Runs on a copy downscaled to long edge 800 px; the quad is scaled back.
- `warpAndSharpen`: `getPerspectiveTransform(quad → warpSize rect)` + `warpPerspective`; rotate by `rotation`; unsharp mask = `addWeighted(img, 1.5, GaussianBlur(img, σ=1.0), −0.5)`.
- All OpenCV `Mat`s are released after use.

### 3.5 `src/imaging/enhance.ts`
```ts
const MAX_EDGE = 1920; const JPEG_QUALITY = 0.95;
normalizePage(uri: string): Promise<string>                         // sharpen + downscale + JPEG 95 → new file uri
applyEdit(uri: string, edit: { quad: Quad; rotation: 0|90|180|270 }): Promise<string>   // warp+rotate+sharpen, then normalize
```
- Uses `warpAndSharpen` (full quad, rotation 0 → sharpen only) then `expo-image-manipulator`: `resize` to long edge 1920 **only if larger**, `saveAsync({ compress: 0.95, format: JPEG })`. Output file in cache; returns its uri. The input file is **not** deleted here (callers own deletion).

### 3.6 `src/scanner/scanner.ts` (changed)
- `scanDocuments(options?: { maxPages?: number })` — passes `croppedImageQuality: 100` (avoid double JPEG compression; we re-encode at 95) and `maxNumDocuments` when given (Android; iOS ignores it, the editor then uses only the first returned image and deletes the rest).

### 3.7 `src/workflows/useOrderedList.ts` (changed)
- Add `update(key: string, value: T): void` — replaces a value in place (keeps key and position).

### 3.8 `src/workflows/scanWorkflow.ts` (changed)
```ts
createScanDocument(deps, pages: { uri: string; align: Align }[], name: string, layout: PageLayout): Promise<DocumentMeta>
```

## 4. Screens

### 4.1 Scan review — `app/scan.tsx`
- List items become `ScanPage`. After each scan / "+ Chụp thêm": run `normalizePage` on every new image (sequentially), show a full-screen overlay **"Đang xử lý ảnh…"** (buttons disabled via the existing busy guard), delete the raw scanner files after success. If normalizing one page fails → keep that raw page (logged), continue.
- Each row: thumbnail (tap → editor), `Trang N`, alignment label (`Trên` / `Giữa` / `Dưới` / `Lấp đầy`), buttons **`Sửa`** and **`Xoá`**. Drag-to-reorder unchanged.
- Under the name input: two segmented rows
  - **Khổ giấy:** `A4` · `Letter` · `Theo ảnh` (default A4)
  - **Lề:** `Không` · `Nhỏ` · `Vừa` (default Vừa; disabled when "Theo ảnh")
- `Tạo PDF` passes pages (uri + align) and the layout to `createScanDocument`.

### 4.2 Page editor — `src/components/PageEditor.tsx` (full-screen `Modal`)
Props: `{ visible, page: ScanPage, pageNumber, layout, onCancel(), onDone(page: ScanPage), onRetake(): Promise<string | null> }`.
- Top bar: `Huỷ` · `Trang N` · `Xong`.
- Centre: the page image (contain-fit) with an overlay quadrilateral and **4 draggable corner handles** (react-native-gesture-handler `Gesture.Pan` + reanimated shared values), a magnifier circle (top-left corner of the screen) showing the area under the active handle while dragging. Corners are clamped to the image.
- On open: read image size, run `detectQuad`; if `null` → `fullQuad`.
- Toolbar: **`Tự cắt sát`** (re-run `detectQuad`), **`Toàn ảnh`** (`fullQuad`), **`Xoay ⟳`** (rotation += 90 mod 360; preview rotates), **`Chụp lại`** (calls `onRetake`; on a new uri the editor reloads with it and resets quad/rotation).
- Alignment row: `Trên` · `Giữa` · `Dưới` · `Lấp đầy` with a **mini PDF-page preview** (paper outline + margin + image rect drawn from `computePlacement`; for "Theo ảnh" the preview shows the image only).
- `Xong`: if the quad is (within 2 px) the full image and rotation is 0 → return the same uri with the new align (no reprocessing). Otherwise show a spinner, run `applyEdit`, return the new uri; the screen deletes the old file. Failure → `Alert.alert('Không xử lý được ảnh')`, editor stays open, page unchanged.
- `Huỷ` / hardware back → close, no change (a retaken-but-not-confirmed image file is deleted).

### 4.3 Merge screen
Unchanged.

## 5. Dependencies & config
- `npx expo install expo-image-manipulator`; `npm install react-native-fast-opencv` (check its README for any extra native setup; New Architecture is already on).
- Requires a new native build (dev client / APK). Expected APK growth ≈ 15–25 MB (OpenCV); measure and record.
- Jest: mock `react-native-fast-opencv` and `expo-image-manipulator` via the wrappers (`src/native/opencv.ts`, `src/imaging/enhance.ts`); add both packages to `transformIgnorePatterns` if needed.

## 6. Error handling

| Situation | Behaviour |
|---|---|
| `detectQuad` finds nothing | Corners at the full image; user drags manually |
| Normalizing after scan fails for a page | Keep the raw scanner image for that page; continue |
| `applyEdit` fails | Alert `Không xử lý được ảnh`; page unchanged; editor stays open |
| Retake cancelled | Editor unchanged |
| Retake returns several images (iOS) | Use the first, delete the rest |

## 7. Testing
- **Unit:**
  - `layout.ts`: A4 portrait/landscape, Letter, `image` mode, 3 margins, 4 aligns, image smaller than printable area (scaled up to fit), `fill` covers the page.
  - `geometry.ts`: `orderQuad` with shuffled points, `clampQuad`, `quadArea`, `warpSize`, `isFullQuad`.
  - `enhance.ts`: resize only when long edge > 1920 (portrait and landscape); compress 0.95; `applyEdit` passes quad/rotation (opencv + manipulator mocked).
  - `createPdfFromImages`: A4 page size, image rect matches `computePlacement`; default layout keeps old behaviour.
  - `useOrderedList.update`: keeps key and order.
  - `scanWorkflow`: forwards align and layout.
- **Screen tests:** PageEditor (cancel = no change; done without edits = same uri + new align; done with rotation calls `applyEdit`; failure alert; retake replaces image); scan screen (normalizes after scan with overlay, segmented controls change layout passed to `createScanDocument`, `Sửa` opens editor, editor `onDone` updates the page in place).
- **Static:** typecheck, expo-doctor.
- **Device (Android emulator):** scan → drag corners → rotate → Xong → thumbnail updated; Tự cắt sát; Chụp lại; A4 + margin + each alignment visible in the generated PDF; processed image long edge ≤ 1920; record APK size delta.

## 8. Success criteria
1. From the scan review the user can re-crop (4 corners, perspective-corrected), rotate, or retake any single page and set its alignment.
2. Generated PDFs use the chosen paper size and margin, landscape pages for landscape images, and each page's alignment.
3. Every scanned page stored for the PDF has long edge ≤ 1920 px, JPEG quality 95, sharpened.
4. All tests and typecheck pass; flow verified on the Android emulator.

## Amendments (2026-10-06, final review)
These supersede the original text of §3.4 and §3.5 where they differ; the sections above are kept as the original design.

**§3.4 detection pipeline as implemented (`detectQuad`).** On the copy with long edge ≤ 800 px: grayscale → GaussianBlur 5×5 → Canny(75, 200) → dilate the edges 3×3 (to close small gaps in the page border); if that pass finds no page, dilate 5×5; if that still finds none, an Otsu-binarized image (`THRESH_BINARY | THRESH_OTSU`, then MORPH_CLOSE 5×5) is the last resort. Each pass runs `findContours(RETR_LIST)` (so the inner edge of a framed page counts too), skips contours too short to enclose 50 % of the image, and approximates each one with `approxPolyDP` at 0.02 and 0.04 × perimeter. The first pass that yields a page wins (`pickPageQuad`). A 4-vertex candidate is ordered with `orderQuad` (its vertex order is ignored, because an out-and-back trace of an open border lists the true corners crossed) and must:
- pass `isQuadUsable`: strictly convex, every pair of corners at least 2 % of the image diagonal apart, every interior angle within 15°–165° (rejects triangles with coinciding corners, slivers, concave shapes);
- pass `isPageInBorder` (controller ruling R11): area ≥ **50 %** of the image AND each corner within **15 %** of the image width/height of its image corner (TL near (0, 0), TR near (w, 0), BR near (w, h), BL near (0, h)). Scanner output is already cropped, so anything else — a table, a form box, a photo inside the page — is not the page;
- not be the image frame itself (within 2 % of the short edge).
The largest such candidate wins; otherwise `detectPageQuad` returns the full image with `detected: false`.

**§3.4/§3.5 page pipeline as implemented (controller ruling R12).** `warpAndSharpen` is replaced by `renderPage(base64Jpeg, { quad | null, rotation, maxEdge, outPath, quality })`, a single OpenCV pass: decode → perspective-warp to `quad` (only when editing) → rotate → `resize` with `INTER_AREA` so the long edge is ≤ 1920 (never upscaled) → unsharp mask `addWeighted(img, 1.5, GaussianBlur(img, σ 1.0), −0.5)` → **one** JPEG encode with `Mat.saveToFile(outPath, 'jpeg', 0.95)` (react-native-fast-opencv takes the quality as a 0–1 fraction and writes `IMWRITE_JPEG_QUALITY = 95`). Sharpening therefore happens after the downscale and is not averaged away, and the image is encoded once. Image sizes come from the Mat (`cols`/`rows`); full-size intermediates are released as soon as they are replaced and every native object is released in `finally`. `normalizePage` (quad `null`, rotation 0) and `applyEdit` (quad + rotation) both go through it and write a new file under `Paths.cache`; in development `normalizePage` logs the input and output size. `expo-image-manipulator` is now only used by `detectPageQuad` to make the 800 px detection copy.
