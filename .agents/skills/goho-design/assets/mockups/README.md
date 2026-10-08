# Mockups

## Current loading and status states (October 8, 2026)

These approved native Compose captures show the production ReceiptOverview and its components. They are app renders without system bars, not emulator screenshots or redrawn mock layouts. The current captures show Bram cradling a blank receipt in the no-receipts state, a calm thumbs-up with “All good” in the empty Needs attention state, and a gentle shrug with “A little hiccup” and the retry action in the load-error state. Content sits directly on the screen background, with a 4dp gap between each status illustration slot and title. The Receipts header is text-only in every state. None of the three status states has an enclosing card. Dedicated Bram artwork for other states is deferred until their feature is implemented.

- `empty-needs-attention.png` and `empty-needs-attention-light.png`: Calm thumbs-up Bram with “All good” and “Nothing needs your attention right now.” directly on the screen background, text-only Receipts header, selected filter, and Scan.
- `empty-no-receipts.png` and `empty-no-receipts-light.png`: No receipts yet, with Bram and copy directly on the screen background, no surrounding card, and Scan in its footer; no filters.
- `load-error.png` and `load-error-light.png`: Gentle shrugging Bram with “A little hiccup”, “We couldn’t load your receipts. Let’s try again.” and the retry action directly on the screen background; title only in the header, no filters or Scan.
- `initial-loading-light.png` and `initial-loading-dark.png`: Initial receipt loading icon after the 200ms delay, in both themes. No icon appears during the delay or on an already loaded background refresh.
- `retry-running.png`, `retry-failed.png`, `retry-succeeded.png`: Disabled retry with its centered loading icon after 200ms and stable bounds, failure in place, and the loaded list after success (light).
- `large-font-retry-running.png`: Retry loading icon at 2× text size; button bounds still reserve both labels.
- `deleted-last-failed-overall.png`: Calm thumbs-up Bram and All good copy on the screen background, with a text-only Receipts header; Needs attention stays selected with All 0 after deleting the last failed receipt (light).
- `large-font-load-error-scrolled.png`, `large-font-no-attention-scrolled.png`, `large-font-no-receipts-scrolled.png`: 2× font, scrolled to expose the body/action; Scan has its own footer where present.
- `small-360-no-receipts.png` and `tall-no-receipts.png`: Short and tall layout references.

Standard captures are 360×800dp at 2× (720×1600px). Edge captures use 360×640dp or 412×960dp. They were produced with the retired native Android graphics harness; its source and capture provenance remain in Git at commit `615f66c44af6c9bc77773af9bd5c4823fc756cb4`. This folder keeps the approved PNG references. There is no active automated Android test workflow: use build, lint and formatting checks plus manual visual and interaction checks, without adding tests or test harnesses.

## Historical layout references (October 2 v2)

The remaining files were rendered from the older design canvas, usually at 824×1784px. They retain the previous jade palette, button geometry, and some superseded content. Use them only for the named layout/interaction concepts. Current colors, shapes, text-only header, status behavior, and approved refinements come from `references/*.md` and the current captures above.

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
