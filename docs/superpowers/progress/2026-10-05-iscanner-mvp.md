# iScanner MVP — Progress Log

Durable record of plan execution, for resuming in later sessions.

- **Plan:** `docs/superpowers/plans/2026-10-05-iscanner-mvp.md`
- **Spec:** `docs/superpowers/specs/2026-10-05-camscanner-mvp-design.md`
- **Branch:** `feat/iscanner-mvp` (from `master` @ `3973cf2`)
- **Execution method:** superpowers:subagent-driven-development (user's choice)
- **Resume rule:** tasks marked ✅ are done — do not redo them; continue at the first task not marked ✅. Trust `git log` over memory.

## Decisions (rulings made during execution)

- R1: Task 8 also creates `src/components/NameInput.tsx` (plan's Files list omitted it).
- R2: `LibraryStore.remove(id)` with an unknown id is a no-op.
- R3: Task 10 passes a thunk to `busy.run(() => createMergedDocument(...))`.
- R4: Task 11 `expo export` writes to a scratch dir outside the repo.
- R5: Routes live in root `app/` (not `src/app/`). The template `AGENTS.md` mentions `src/app/` and bun — ignore that guidance (to be fixed in final review).

## Tasks

| # | Task | Status | Commits | Notes |
|---|---|---|---|---|
| 1 | Scaffold Expo project | ✅ done | `1e1029a` | review clean |
| 2 | Format & name helpers | ✅ done | `7657898` | review clean |
| 3 | PDF create & merge | ✅ done | `2fd0fc2` | review clean |
| 4 | Library store | ✅ done | `a116414`, `4fca531` | 1 fix round (atomic writes) |
| 5 | Ordered list & busy hooks | ⏳ in progress | | |
| 6 | Scan & merge workflows | ⬜ | | |
| 7 | Library context & native wrappers | ⬜ | | |
| 8 | Root layout & Home screen | ⬜ | | |
| 9 | Scan review screen | ⬜ | | |
| 10 | Merge PDFs screen | ⬜ | | |
| 11 | Viewer & final verification | ⬜ | | |

## Task details

<!-- One section per completed task: what was built, key files, versions/facts later work needs, deferred minor findings. -->

### Task 1 — Scaffold (✅ `1e1029a`)
- Template `blank-typescript` copied to repo root; `App.tsx`/`index.ts` removed; `main: expo-router/entry`; scripts `npm test`, `npm run typecheck`.
- Versions: expo ~57.0.26, react-native 0.86.3, reanimated 4.5.1 + react-native-worklets 0.10.1, draggable-flatlist ^4.0.3, jest ~29.7, jest-expo ~57.0.5, @testing-library/react-native ^14.0.1, TypeScript ~6.0.3, pdf-lib ^1.17.1.
- Gotchas: `react-dom@19.2.3` was installed explicitly to fix an npm ERESOLVE. `tsconfig.json` has `"types": ["jest","node"]`, because TS 6 no longer auto-includes @types, so add new ambient types there. `npx expo install … -- --save-dev` misplaces packages; check devDependencies afterwards.
- Verification: jest 1/1, typecheck clean, expo-doctor 21/21.
- Deferred minors: `@types/node` is not a direct devDependency; the template `AGENTS.md` is misleading (src/app, bun).

### Task 2 — Format helpers (✅ `7657898`)
- `src/utils/format.ts` provides four helpers:
  - `formatDate(iso)` → `dd/MM/yyyy HH:mm`
  - `defaultName('scan'|'merge', date)` → `Scan|Gộp dd-MM-yyyy HH.mm`
  - `formatSize(bytes)` → `B/KB/MB` (1024 base, 1 decimal)
  - `sanitizeName(input, fallback)` (trim, fallback, max 100)
- Tests: `__tests__/utils/format.test.ts` (9 tests, local-time dates).
- Deferred minors: the date padding code is duplicated; truncation may split emoji surrogate pairs; an invalid ISO string gives `NaN`; tests cover only happy paths.

### Task 3 — PDF create & merge (✅ `2fd0fc2`)
- `src/pdf/images.ts`:
  - types `ImageMime`, `ImageInput`
  - `detectImageType(bytes)` (magic bytes; throws `UNSUPPORTED_IMAGE`)
- `src/pdf/createPdfFromImages.ts`: `createPdfFromImages(images)` creates one page per image, sized to the image's pixels. Throws `NO_IMAGES` on an empty list.
- `src/pdf/mergePdfs.ts`:
  - `PdfLoadError` (has `.index`, message `PDF_LOAD_FAILED`)
  - `getPdfPageCount(pdf)`
  - `mergePdfs(pdfs)` (throws `NO_PDFS`; encrypted or corrupt input → `PdfLoadError` with the input index)
- Test fixtures: `__tests__/fixtures/images.ts` provides `makePng(w,h)` and `makeJpeg(w,h)`.
- Tests: 9 pdf tests; full suite 19/19.
- Deferred minors: `PdfLoadError` drops the original cause; the encrypted-PDF test uses a mock, not a real encrypted file.

### Task 4 — Library store (✅ `a116414`, fix `4fca531`)
- `src/library/types.ts` defines:
  - `DocumentSource`
  - `DocumentMeta` (`id`, `name`, `fileName`, `createdAt`, `pageCount`, `sizeBytes`, `source`)
  - `FsAdapter` (`readText` / `writeText` / `writeBytes` / `readBytes` / `delete` / `ensureDir` / `uri`)
  - `LibraryStore`
- `src/library/libraryStore.ts`: `createLibraryStore({ fs, now?, newId? })`.
  - Files are stored at `pdfs/<id>.pdf`, with the index at `library.json` `{version:1, documents}`.
  - A corrupt index or one with the wrong version is backed up to `library.json.bak` and the library starts empty.
  - `add` writes the PDF first, then the index, and deletes the PDF if the index write fails.
  - `remove` writes the index first, then deletes the file. An unknown id is a no-op.
  - `rename` throws `NOT_FOUND` for an unknown id; an empty name keeps the current name.
- `src/library/memoryFs.ts`: `createMemoryFs()` with `.files` (Map) and `failNextWrite(path)`, for tests.
- `src/library/expoFs.ts`: SDK 57 `File`/`Directory`/`Paths.document`. Writes go to `<path>.tmp`, then `moveSync(target, {overwrite:true})`. Not unit-tested.
- Tests: libraryStore 9/9; full suite 28/28.
- Deferred minors:
  - If the backup write fails, `list()` throws.
  - Operations that read and then write the index are not serialised.
  - Index entries are not validated.
  - On iOS, move-with-overwrite has a small non-atomic window.
