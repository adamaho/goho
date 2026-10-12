# Mockups

## Launcher icons

The current family icon sources and Android resources are documented in the [launcher guide](../../references/launcher-icons.md). Its generator writes a colour and themed review sheet to ignored `.data/launcher-preview/launcher-icons.png`. Launcher preview sheets, exports, and unused candidates are not committed. The [character guide](../../references/characters.md) links the preserved individual and family PNG masters.

## Current filter swipes (October 12, 2026)

Manual emulator captures of the existing list after horizontal gestures, with no new page layout:

- `filter-swipe-attention-light.png`: Swipe left over a receipt to select the empty Needs attention filter.
- `filter-swipe-all-light.png`: Swipe right over empty content to return to All.
- `filter-swipe-large-text-dark.png`: Selected Needs attention after a swipe at 2× font size, 320×457dp in dark mode (840×1200px at 420dpi). The status content remains scrollable.
- `filter-swipe-vertical-refresh.png`: A vertical pull still fills the refresh ring, without changing the filter.

Normal captures are 1080×2424px at 420dpi. Accessibility hierarchy checks confirmed the selected tab changes with each direction and remains Needs attention when swiping left at that end. Short drags and rightward drags on All left All selected. Receipt taps opened details, long presses opened options, and vertical scrolling moved receipt content while the header stayed fixed. No Android tests or harnesses were added.

## Current pull-to-refresh (October 12, 2026)

These unedited development-app screenshots were captured manually on the Pixel 9 API 36 emulator with a temporary local GET-only proxy to delay or fail receipt requests. They follow the existing lavender accent, loading-icon style and shared secondary action button.

- `pull-refresh-enter.png`, `pull-refresh-exit-bounce.png`, `pull-refresh-exit-shrinking.png`, `pull-refresh-exit-hidden.png`: Current bounded 108% entrance/exit bounce and in-place shrink to zero with fading. Captured manually at 3× system animation duration to inspect intermediate frames, then restored to normal speed. Exit frames preserve the indicator centre while the ring contracts and disappears.
- `pull-refresh-threshold-dark.png`: Fully closed ring before release. Android vibration history confirms one threshold tick.
- `pull-refresh-loading-dark.png` and `pull-refresh-error-dark.png`: Pinned spinner and warning triangle in dark mode.
- `pull-refresh-light.png`: Refreshing the populated list in reserved space above the receipts while filters and Scan remain anchored.
- `pull-refresh-empty-dark.png`: Refreshing the empty Needs attention filter in dark mode without changing the selection.
- `pull-refresh-error-light.png`: The ring morphs into an orange warning triangle for three seconds; failed refresh keeps the cached list and offers the shared Try again action.
- `pull-refresh-large-text.png`: Dark mode at 320×640dp with 2× font scale and animations disabled. The indicator remains static, verified by identical app pixels in captures taken one second apart.

Standard captures are 1080×2424px at 420dpi; the large-text capture is 840×1680px. Manual checks covered short pulls, threshold release, the recorded threshold haptic, repeated pulls during an active request, one request per endpoint, success dismissal, failure presentation, retry recovery, and progress/failure descriptions in the accessibility hierarchy. The warning replaces the progress role. Separate loading captures show the spinner rotating; the failure outline interpolates between matching circle and triangle perimeter samples. TalkBack action execution was not manually exercised. Android build, lint and formatting checks passed; no Android tests, harnesses or previews were added.

## Current skeleton loading (October 11, 2026)

These are unedited manual screenshots of the development app on the Pixel 9 API 36 emulator, including system bars. GET responses were temporarily delayed through a local read-only proxy; the regular list rows and detail components rendered their loading states. No Android test harness or separate skeleton layout was used.

- `initial-loading-light.png` and `initial-loading-dark.png`: Four existing list rows with shared text/thumbnail masks, plus the normal Receipts header and Scan action.
- `receipt-detail-loading-light.png` and `receipt-detail-loading-dark.png`: The existing hero, photo frame, item card and detail rows under skeleton masks. Back remains enabled.
- `large-font-list-loading.png`, `large-font-detail-loading.png`, `large-font-detail-loading-scrolled.png`: 320×640dp at 2× font scale with Remove animations enabled. Text masks remain static and both screens scroll. These captures include system bars and are 840×1680px; standard skeleton captures are 1080×2424px at 420dpi.

Manual checks also covered successful loading, timeout/error recovery, back during detail loading, and accessibility hierarchy inspection. Loading regions expose one polite indeterminate-progress description without placeholder labels or actions. Two reduced-motion captures taken one second apart had identical content pixels. Compile, lint and formatting checks accompany these visual checks.

## Current status states (October 8, 2026)

These approved native Compose captures show the production ReceiptOverview and its components. They are app renders without system bars, not emulator screenshots or redrawn mock layouts. The current captures show Bram cradling a blank receipt in the no-receipts state, a calm thumbs-up with “All good” in the empty Needs attention state, and a gentle shrug with “A little hiccup” and the retry action in the load-error state. Content sits directly on the screen background, with a 4dp gap between each status illustration slot and title. The Receipts header is text-only in every state. None of the three status states has an enclosing card. Dedicated Bram artwork for other states is deferred until their feature is implemented.

- `empty-needs-attention.png` and `empty-needs-attention-light.png`: Calm thumbs-up Bram with “All good” and “Nothing needs your attention right now.” directly on the screen background, text-only Receipts header, selected filter, and Scan.
- `empty-no-receipts.png` and `empty-no-receipts-light.png`: No receipts yet, with Bram and copy directly on the screen background, no surrounding card, and Scan in its footer; no filters.
- `load-error.png` and `load-error-light.png`: Gentle shrugging Bram with “A little hiccup”, “We couldn’t load your receipts. Let’s try again.” and the retry action directly on the screen background; title only in the header, no filters or Scan.
- `retry-running.png`, `retry-failed.png`, `retry-succeeded.png`: Disabled retry with its centered loading icon after 200ms and stable bounds, failure in place, and the loaded list after success (light).
- `large-font-retry-running.png`: Retry loading icon at 2× text size; button bounds still reserve both labels.
- `deleted-last-failed-overall.png`: Calm thumbs-up Bram and All good copy on the screen background, with a text-only Receipts header; Needs attention stays selected with All 0 after deleting the last failed receipt (light).
- `large-font-load-error-scrolled.png`, `large-font-no-attention-scrolled.png`, `large-font-no-receipts-scrolled.png`: 2× font, scrolled to expose the body/action; Scan has its own footer where present.
- `small-360-no-receipts.png` and `tall-no-receipts.png`: Short and tall layout references.

The October 8 status captures are 360×800dp at 2× (720×1600px). Edge captures use 360×640dp or 412×960dp. They were produced with the retired native Android graphics harness; its source and capture provenance remain in Git at commit `615f66c44af6c9bc77773af9bd5c4823fc756cb4`. This folder keeps the approved PNG references. There is no active automated Android test workflow: use build, lint and formatting checks plus manual visual and interaction checks, without adding tests or test harnesses.

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
