# Mockups

## Current Bram status states (October 7, 2026 no-receipts illustration and layout refinement)

These captures render the production ReceiptOverview and its components using Robolectric native Android graphics (API 35) and Roborazzi. They are app renders without system bars, not emulator screenshots or redrawn mock layouts. The no-receipts captures were rerun on October 7 with Bram cradling a blank receipt and the illustration and copy directly on the screen background; their evidence is in `art/bram/no-receipts-review/` at the repository root. All other captures retain the approved PR #101 source and artwork at `f202fc183a627d0025a8aecdbcba54cca5be4194`.

- `empty-needs-attention.png` and `empty-needs-attention-light.png`: Nothing needs attention, with Bram, the selected filter, and Scan.
- `empty-no-receipts.png` and `empty-no-receipts-light.png`: No receipts yet, with Bram and copy directly on the screen background, no surrounding card, and Scan in its footer; no filters.
- `load-error.png` and `load-error-light.png`: Load error, title only in the header, retry action, no Scan.
- `retry-running.png`, `retry-failed.png`, `retry-succeeded.png`: Disabled retry with stable bounds, failure in place, and the loaded list after success (light).
- `deleted-last-failed-overall.png`: Needs attention stays selected with All 0 after deleting the last failed receipt (light).
- `large-font-load-error-scrolled.png`, `large-font-no-attention-scrolled.png`, `large-font-no-receipts-scrolled.png`: 2× font, scrolled to expose the body/action; Scan has its own footer where present.
- `small-360-no-receipts.png` and `tall-no-receipts.png`: Short and tall layout references.

Standard captures are 360×800dp at 2× (720×1600px). Edge captures use 360×640dp or 412×960dp. Source filenames and SHA-256 values are recorded in `bram-captures.json`. Its top-level evidence commit and source directory apply unless a capture overrides them. The new no-receipts entries set `evidenceCommit` to null and link their current-change provenance directly. See the [original evidence and reproduction instructions](https://github.com/adamaho/goho/blob/c8f96f46a34118d3d45e44f3f7b2aa710afb86a8/.github/pr-assets/bram-status-states/README.md) for the rendering harness. The non-no-receipts captures are reused evidence. No-receipts images come from the new native render run documented in `art/bram/no-receipts-review/after/validation.json`; before captures are preserved in the sibling `before/` directory.

## Historical layout references (October 2 v2)

The remaining files were rendered from the older design canvas, usually at 824×1784px. They retain the previous jade palette, button geometry, and some superseded content. Use them only for the named layout/interaction concepts. Current colors, shapes, Bram header, status behavior, and approved refinements come from `references/*.md` and the current captures above.

- `receipts.png` / `receipts-light.png`: Populated list layout.
- `receipt-details.png` / `receipt-details-light.png`: Details with items and overflow.
- `photo-viewer.png`, `viewer-zoomed.png`, `viewer-controls-hidden.png`, `viewer-swipe-to-close.png`: Viewer states.
- `viewer-landscape.png`: Historical reference only; the app stays portrait-only.
- `scan-preview.png` / `scan-preview-light.png`: Scan preview layout.
- `sheet-menu-from-list.png`, `sheet-confirm-from-list.png`, `sheet-menu-from-details.png`, `sheet-confirm-from-details.png`, `sheet-menu-not-processed.png`, `sheet-confirm-not-processed.png` (and `-light` variants): Receipt options and deletion.
- `motion-1-open-from-list.png` through `motion-5-delete-from-details.png`: Original motion storyboards.
- `list-hold-press.png`, `list-tap-not-processed.png`, `list-after-delete.png` (and `-light` variants): List interactions.
- `tokens.png` / `tokens-light.png`: Historical token boards; use the Bram values in `references/tokens.md` and `assets/compose/GohoTheme.kt` instead.

Written specs win over any older image. Preserve proportional figures, compact fixed filters, scale-only row holds, no bottom gradient, no separate photo expand button, no item count, and no confirmation heading. Keep the sheet header mounted and reveal confirmation content together without stagger or bounce. The ready scan preview has no status line.
