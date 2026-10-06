# iScanner — Page Editor / Better Crop / Full HD — Progress Log

Durable record of plan execution, for resuming in later sessions.

- **Requirement:** `requirement/requirement.txt`, entry "06/10/2026 - sequence 1"
- **Spec:** `docs/superpowers/specs/2026-10-06-page-editor-design.md`
- **Plan:** `docs/superpowers/plans/2026-10-06-page-editor.md`
- **Branch:** `feat/page-editor` (from `master` @ `79efc45`)
- **Execution method:** superpowers:subagent-driven-development (user's choice)
- **Resume rule:** tasks marked ✅ are done; continue at the first task not marked ✅. Trust `git log` over memory.

## User decisions (brainstorming)
- "Edit position" = **B** (re-crop with 4 corners / rotate / retake a single page after scanning) **+ C** (place the image on the PDF page).
- Full HD = long edge ≤ **1920 px** (downscale only) and JPEG **0.95**. The scanner returns quality 100.
- Layout = per-document paper size **A4 / Letter / Theo ảnh** with margin **Không / Nhỏ / Vừa**, plus per-page alignment **Trên / Giữa / Dưới / Lấp đầy**.
- Approach 1: keep ML Kit / VisionKit, and add `react-native-fast-opencv` (detect + perspective warp + sharpen) and `expo-image-manipulator` (resize + JPEG).

## Rulings
- R1: the `ScanPage` type is exported from `src/components/PageEditor.tsx`.
- R2: expo-doctor *warnings* about react-native-fast-opencv are acceptable.
- R3: `Rotation` is exported from `src/native/opencv.ts` and re-exported by `src/imaging/enhance.ts`.
- R4: `warpAndSharpen` output is written to a temp file before expo-image-manipulator processes it.
- R5: Task 7 (native build and emulator checks) is run by the controller directly.
- R6: Task 1 top/bottom test uses a 1000×1100 image (the plan's 1000×500 is landscape).
- R7: Task 1 RED not recorded; the reviewer confirmed the tests are meaningful.
- R8: `orderQuad` uses a centroid + atan2 clockwise sort starting at min(x+y) instead of the plan's sum/diff formula, which crosses on ~45° pages.
- R9: the editor takes the image size from `detectPageQuad(uri).size` instead of `Image.getSize`.
- R10: the corner handles use `Gesture.Pan().runOnJS(true)` with React state instead of reanimated shared values. Smoothness is to be checked on the emulator.

## Tasks

| # | Task | Status | Commits | Notes |
|---|---|---|---|---|
| 1 | Page layout math + layout-aware PDF | ✅ done | `4c69862` | review clean |
| 2 | Quad geometry helpers | ✅ done | `1020aab`, `904aa2d` | 1 fix round (orderQuad) |
| 3 | OpenCV + Full HD normalization wrappers | ✅ done | `7ffde3c`, `8d8a429` | 1 fix round (detect fallback) |
| 4 | Ordered list `update` | ✅ done | `2bb745f` | review clean |
| 5 | Page editor component | ✅ done | `9262f27` | review clean |
| 6 | Scan review integration | ✅ done | `a2d7fe9` | review clean |
| 7 | Device verification + APK 1.1.0 | ⏳ in progress | | |

## Task details

### Task 1 — Page layout (✅ `4c69862`)
- `src/pdf/layout.ts`:
  - types `PageSize` / `Margin` / `Align` / `PageLayout`, and `DEFAULT_LAYOUT` (A4 + medium)
  - `computePlacement(img, layout, align)`: PDF origin is bottom-left; landscape images get a landscape page; `fill` covers the whole page; other aligns fit inside the margins.
- `createPdfFromImages(images: PageImage[], layout?)`: the default layout `{image, none}` keeps the old behaviour. `PageImage` adds `align`.
- `createScanDocument(deps, pages: {uri, align}[], name, layout)`. For now `app/scan.tsx` passes `align:'center'` and `DEFAULT_LAYOUT`; the UI comes in Task 6.
- Ruling R6: the plan's top/bottom test used a landscape image, so the test was switched to 1000×1100. Ruling R7: the RED step was not recorded; the reviewer confirmed the tests are meaningful.
- Tests: 101/101.

### Task 2 — Geometry (✅ `1020aab`, fix `904aa2d`)
- `src/imaging/geometry.ts`:
  - types `Point`, `Quad`
  - `orderQuad` (centroid + atan2, clockwise TL→TR→BR→BL; throws `QUAD_NEEDS_4_POINTS`)
  - `fullQuad`, `clampQuad`, `quadArea`, `warpSize`, `isFullQuad`, `isQuadUsable` (≥ 5% of the image), `scaleQuad`
- Review caught that the plan's formula crossed the quad on ~45° pages; fixed per R8.
- Repo hygiene: the implementer twice restored `.gitignore` and dropped the `.claude/settings.local.json` line, so the controller committed it (`6410554`).
- Tests: 117/117.

### Task 3 — OpenCV + Full HD (✅ `7ffde3c`, fix `8d8a429`)
- Installed `expo-image-manipulator` 57.0.20 and `react-native-fast-opencv` 1.0.1. expo-doctor 21/21 with no warnings.
- `src/native/opencv.ts` (JSI, not unit-tested):
  - `detectQuad(base64, w, h)`: Canny(75,200), approxPolyDP 0.02, area ≥ 20%.
  - `warpAndSharpen(base64, quad, rotation)`: warp, then rotate, then unsharp 1.5/−0.5 σ1.
  - Every Mat is released in `finally`. Exports `Rotation`.
- `src/imaging/enhance.ts`:
  - `targetSize` keeps long edge ≤ 1920 and never upscales.
  - `normalizePage(uri)` and `applyEdit(uri, {quad, rotation})` both end with JPEG 0.95 and return a new uri; the input file is kept.
  - `detectPageQuad(uri)` works on an 800 px copy and scales the quad back. On null **or an exception** it falls back to `fullQuad` (fixed in the review round).
- `scanDocuments({maxPages?})` now uses `croppedImageQuality: 100`.
- Deferred minors for the final review:
  - **Manipulator `ImageRef`s are not released (OOM risk with 12MP images).**
  - Possible EXIF orientation mismatch.
  - Double JPEG encode.
  - `warpAndSharpen` does not run `orderQuad` itself.
- Tests: 132/132. Not yet run on a device.

### Task 4 — List update (✅ `2bb745f`)
- `useOrderedList<T>().update(key, value)` replaces a value in place and keeps the key and order. An unknown key is a no-op. Tests: 134/134.

### Task 5 — Page editor (✅ `9262f27`)
- `src/components/PageEditor.tsx` exports `ScanPage` and `PageEditor`.
  - Props: `{visible, page, pageNumber, layout, onCancel, onDone(page), onRetake()}`.
  - It is a full-screen Modal with its own GestureHandlerRootView.
  - Toolbar: Tự cắt sát / Toàn ảnh / Xoay ⟳ / Chụp lại.
  - Alignment buttons: Trên / Giữa / Dưới / Lấp đầy.
  - `Xong` reorders the corners, checks the crop area is ≥ 5%, then calls `applyEdit`.
- `src/components/CornerHandles.tsx`:
  - 4 Pan handles and a magnifier.
  - Pure helpers map screen coordinates to image coordinates for each rotation; they are tested.
- `src/components/PagePreview.tsx` draws a mini PDF page from `computePlacement`.
- Files the editor deletes:
  - It never deletes `page.uri`.
  - It deletes the retaken file on Huỷ, on a second retake, or after an edit has been applied.
  - **The caller must delete the old `page.uri` when `onDone` returns a different uri.**
- Jest: `jest.setup.js` loads `react-native-gesture-handler/jestSetup`. `MARGIN_POINTS` is exported from `layout.ts`.
- Deferred minors:
  - A stale detection token can still raise an alert after the editor has closed.
  - Handles near the canvas edge may be hard to grab on Android (check on device).
  - The spinner keeps spinning after a decode failure.
- Tests: 162/162.

### Task 6 — Scan review integration (✅ `a2d7fe9`)
- `app/scan.tsx`:
  - Each page in the list is now a `ScanPage`.
  - After every scan or "+ Chụp thêm", the new pages are normalized one at a time inside the busy guard, with the overlay `Đang xử lý ảnh…`. A page that fails keeps its raw image.
  - Each row shows the alignment label, a `Sửa` button and the thumbnail; both open the editor.
  - New segmented controls: `Khổ giấy` (A4/Letter/Theo ảnh) and `Lề` (Không/Nhỏ/Vừa, disabled for Theo ảnh).
  - Retake scans with `maxPages:1` and normalizes the result.
  - If the user leaves the screen while pages are processing, the processed files are cleaned up.
- `src/components/SegmentedControl.tsx`.
- Deferred minors:
  - Long-pressing the thumbnail may open the editor instead of starting a drag (check on device).
  - The alignment labels are duplicated.
  - The act() warning is intermittent in the index/merge suites.
- Tests: 176/176.
