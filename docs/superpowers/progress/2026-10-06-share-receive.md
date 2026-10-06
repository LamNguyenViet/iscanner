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
| 2 | Import to cache + payload wrapper | ⏳ | | |
| 3 | app.json + native-intent + incoming screen | ⬜ | | |
| 4 | Merge/scan consume pending files | ⬜ | | |
| 5 | Device verification + docs | ⬜ | | |

## Task details

### Task 1 (✅ `b586789`)
- `src/share/types.ts` defines `IncomingFile` and `IncomingPlan`.
- `classify.ts`: magic bytes `%PDF-` mean pdf; JPEG and PNG mean image. Ruling R2: `%PDF-` is 5 bytes.
- `plan.ts` decides the flow: none, single-pdf (with images), merge (with images), or scan. Order is preserved.
- `incomingStore.ts`: `setPending` returns the dropped files; `takePdfs` and `takeImages` read once; there are also `hasPendingImages` and `clearPending`.
- Tests: 246/246.
