# Mockups

Rendered from the Goho design canvas at 2x (824×1784 for phone screens).

- `receipts.png` and `receipts-light.png`: Receipts list, dark and light
- `receipt-details.png` and `receipt-details-light.png`: Receipt details (with items and the overflow button), dark and light
- `photo-viewer.png`: Photo viewer at fit (dark in both themes)
- `viewer-zoomed.png`: Zoomed 2.5× after a double-tap on the total
- `viewer-controls-hidden.png`: After a single tap hides the controls
- `viewer-swipe-to-close.png`: Mid swipe-down, over the light details screen
- `viewer-landscape.png`: Landscape
- `scan-preview.png` and `scan-preview-light.png`: Scan preview, dark and light
- `sheet-menu-from-list.png`, `sheet-confirm-from-list.png`, `sheet-menu-from-details.png`, `sheet-confirm-from-details.png`, `sheet-menu-not-processed.png`, `sheet-confirm-not-processed.png` (and `-light` versions): Receipt options sheet and delete confirmation
- `motion-1-open-from-list.png` to `motion-5-delete-from-details.png`: Delete motion storyboards with timings (light)
- `list-hold-press.png`, `list-tap-not-processed.png`, `list-after-delete.png` (and `-light` versions): Pressing and holding a row, tapping a Not processed row, and the list after a delete
- `tokens.png` and `tokens-light.png`: Color, type, shape and component references

The "Reading receipt…" shimmer and the amount skeleton are captured mid-animation as static frames. The mockups are visual references only; when a mockup and `references/*.md` disagree, the written spec wins.

Approved app refinements: use proportional figures; title the list Receipts with compact fixed filters below it and no bottom gradient; scale-only row holds with no highlight; tap the details photo without an expand button; omit the item count; keep the app portrait-only. The landscape mockup is reference only. For the v6 sheets, keep the receipt header mounted and reveal confirmation content together without stagger or bounce. Motion storyboards show source concepts; these preferences override them. Details overflow remains a future reference.
