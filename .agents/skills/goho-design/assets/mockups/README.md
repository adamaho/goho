# Mockups

## Current status states (October 7, 2026 Bram asset scope)

These captures render the production ReceiptOverview and its components using Robolectric native Android graphics (API 35) and Roborazzi. They are app renders without system bars, not emulator screenshots or redrawn mock layouts. The current captures show Bram cradling a blank receipt directly on the no-receipts screen background, the neutral Bram header mark where applicable, and text-only needs-attention and load-error content directly on the screen background. None of the three status states has an enclosing card. Their capture tooling is in `programs/goho-android/tools/bram-captures/` at the repository root. Dedicated Bram artwork for other states is deferred to a later PR.

- `empty-needs-attention.png` and `empty-needs-attention-light.png`: Nothing needs attention text directly on the screen background, neutral Bram header mark, selected filter, and Scan.
- `empty-no-receipts.png` and `empty-no-receipts-light.png`: No receipts yet, with Bram and copy directly on the screen background, no surrounding card, and Scan in its footer; no filters.
- `load-error.png` and `load-error-light.png`: Load-error text and retry action directly on the screen background, title only in the header, no Bram illustration or Scan.
- `retry-running.png`, `retry-failed.png`, `retry-succeeded.png`: Disabled retry with stable bounds, failure in place, and the loaded list after success (light).
- `deleted-last-failed-overall.png`: Needs-attention text on the screen background and neutral Bram header; Needs attention stays selected with All 0 after deleting the last failed receipt (light).
- `large-font-load-error-scrolled.png`, `large-font-no-attention-scrolled.png`, `large-font-no-receipts-scrolled.png`: 2× font, scrolled to expose the body/action; Scan has its own footer where present.
- `small-360-no-receipts.png` and `tall-no-receipts.png`: Short and tall layout references.

Standard captures are 360×800dp at 2× (720×1600px). Edge captures use 360×640dp or 412×960dp. Source filenames and SHA-256 values are recorded in `bram-captures.json`. The manifest identifies the current source and capture provenance. See the [original evidence and reproduction instructions](https://github.com/adamaho/goho/blob/c8f96f46a34118d3d45e44f3f7b2aa710afb86a8/.github/pr-assets/bram-status-states/README.md) for the rendering harness’s history. Run `programs/goho-android/tools/bram-captures/render.sh` from the repository root to reproduce the current status images. Generated captures, semantics and JUnit results go to the ignored `programs/goho-android/build/bram-captures/` directory. This folder keeps only the approved screen references. Earlier before/after evidence is preserved in Git history at commit `69c44fb`.

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
