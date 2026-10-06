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

## Tasks

| # | Task | Status | Commits | Notes |
|---|---|---|---|---|
| 1 | Page layout math + layout-aware PDF | ✅ done | `4c69862` | review clean |
| 2 | Quad geometry helpers | ✅ done | `1020aab`, `904aa2d` | 1 fix round (orderQuad) |
| 3 | OpenCV + Full HD normalization wrappers | ⏳ in progress | | |
| 4 | Ordered list `update` | ⬜ | | |
| 5 | Page editor component | ⬜ | | |
| 6 | Scan review integration | ⬜ | | |
| 7 | Device verification + APK 1.1.0 | ⬜ | | |

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
