# Mockups

## Launcher icons

The current family icon sources and Android resources are documented in the [launcher guide](../../references/launcher-icons.md). Its generator writes a colour and themed review sheet to ignored `.data/launcher-preview/launcher-icons.png`. Launcher preview sheets, exports, and unused candidates are not committed. The [character guide](../../references/characters.md) links the preserved individual and family PNG masters.

## Shared category and upload tags (October 19, 2026)

These unedited native Goho Dev screenshots come from the Pixel 9 API 36 emulator (1080×2424px at 420dpi, except the compact captures below). The regular app rendered temporary, read-only sample API responses for the nine colours and upload states; no records were created or changed. The normal dev-server receipts were also checked. No separate preview activity, Android tests or test harness was added.

- `receipt-tags-light.png`, `receipt-tags-dark.png`: Categories beneath the right-aligned price, required leading icons, Purple processing and Orange failure tags. These supersede the old fully rounded status pills in earlier screenshots.
- `receipt-tags-more-light.png`, `receipt-tags-more-dark.png`: Remaining colours, the Grey fallback for a long unknown category, and no tag for a blank category. Long names wrap while the date retains space.
- `receipt-tag-detail-light.png`, `receipt-tag-detail-dark.png`: The same Home icon/colour tag in Details. Tapping the list tag opened this receipt; it does not introduce a separate action.
- `receipt-tag-failed-sheet-dark.png`: Tapping “Not processed” still opens receipt options; the sheet uses the same shared warning tag. The sheet was dismissed without deleting anything.
- `receipt-tags-large-text-dark.png`, `receipt-tags-long-large-text-dark.png`: 320×640dp, 2× font scale, animations disabled (840×1680px). Labels wrap, icons remain present and rows scroll. The amount and tag stay right-aligned in the stacked layout. Processing-tag pixels were unchanged across two captures with animations disabled.
- `receipt-tags-loading-light.png`: Existing list rows and their tag elements under the shared skeleton scope, with real server reads temporarily delayed. Scan remains at the fixed bottom/end inset.

`Tag` is a display-only primitive requiring a Painter, label and one of nine `TagColor` values. Category and receipt-upload wrappers supply their existing labels and icon/colour mappings. See `references/components.md`, `references/tokens.md`, the mirrored Compose sources and `assets/icons/tags/README.md` for the API, measurements, palette and Lucide attribution. Scan preview's existing upload status copy also uses the component; that capture/upload interaction was not exercised in this screenshot session.

Manual checks covered both palettes, all category colours, long/unknown and blank categories, tag-area navigation, failed-row options, narrow/large-text layout, static reduced-motion tags and initial skeleton loading. Android build, lint and Kotlin formatting passed. Older captures remain references for their named interactions or artwork; this section is the current tag reference.

## Scan horizontal inset (October 18, 2026)

`scan-inset-light.png` and `scan-inset-dark.png` are unedited Pixel 9 API 36 emulator captures (1080×2424px) of the loaded receipt list. Scan now sits 24dp from the end edge, 8dp farther inward than the 16dp receipt-card margin. Its bottom position remains 28dp above the navigation safe area. Manual bounds inspection confirmed the 8dp horizontal move with unchanged vertical bounds. These supersede the horizontal Scan placement in earlier captures; the cold-start captures below remain references for vertical anchoring.

## Cold-start Scan placement (October 18, 2026)

`cold-start-loading-light.png` and `cold-start-loading-dark.png` are unedited Pixel 9 API 36 emulator captures (1080×2424px), with real dev-server reads temporarily delayed to expose initial loading. Scan remains at the bottom right while skeletons are visible. A cold launch from launcher search with the keyboard open reproduced the previous lift; frame captures after the fix keep Scan at the bottom before skeletons appear, during loading and after receipts arrive. The receipt screen uses system-bar and display-cutout insets without reserving outgoing keyboard space. The same position was checked in the error state. These are the current cold-start layout references.

## Shared icon buttons (October 17, 2026)

`icon-buttons-light.png` and `icon-buttons-dark.png` are unedited native Goho Dev captures from the Pixel 9 API 36 emulator (1080×2424px). They show the receipt-detail Back and More options controls using variant 2/Grey through `IconButton`, with the shared action-button surface, round 44dp layout and 20dp icons. The top bar renders above the scroll body’s fade, preserving the soft shadow without a horizontal cutoff. Dark variant 2 now joins the face directly to the border, without the inset dark ring seen in older captures. These supersede icon-button styling in older captures. Labels and overflow navigation were manually checked; Back returns to the list. Photo close delegates to the same component under the dark theme, retaining its visual-opacity callback and accessible target; that viewer flow was not exercised in this capture session.

`buttons-continuous-border-dark.png` shows the same uninterrupted variant 2/Grey border on Cancel in the confirmation sheet. The dark inset ring has been removed from the shared surface for both round and labelled controls. Cancel was exercised without deleting the receipt.

## Lavender light palette (October 15, 2026)

`palette-lavender-light.png` is an unedited Goho Dev capture on the paired Pixel 9 (1080×2424px), showing the current list palette and tightened Scan shadow. Light mode now uses `#F5F4FD` as its background and shimmer highlight, matching the approximately 247° hue of dark `#15141D`. Muted surfaces, pressed surfaces and skeleton masks use the same violet neutral family. White cards and sheets remain distinct. Earlier light-mode screenshots show the historical warm background; the written palette in `references/tokens.md` takes precedence.

## Light button refinement (October 15, 2026)

`buttons-scan-light.png` is an unedited native Goho Dev capture on the paired Pixel 9 (1080×2424px), showing the tighter light-mode variant 1 shadow. The wide shadow now uses 16dp blur, 4dp downward offset and 18% opacity; the near shadow uses 12%. Light Grey uses a brighter `#FAF8FD` face at 96% opacity, pressed `#F0ECF6` at 98%, to reduce neighbouring shadow bleed. See `references/tokens.md` for the current values. The October 14 light captures below are historical for button shadows and grey fills; dark captures remain current. The updated dev build is installed for on-device review of stacked actions.

## Current button finishes (October 14, 2026)

Unedited development-app screenshots from the Pixel 9 API 36 emulator (1080×2424px, 420dpi). These supersede button appearances in earlier captures; layout, artwork and interaction references below still apply.

- `buttons-primary-light.png`, `buttons-primary-dark.png`: glossy deep-periwinkle primary retry and Scan buttons, white content, bright upper rim and inset reflection.
- `buttons-secondary-light.png`, `buttons-secondary-dark.png`: frosted light retry action and refined dark charcoal retry action with a continuous grey outer rim, dark inner edge and soft shadow, alongside glossy Scan. A temporary unavailable local endpoint kept the existing receipt visible; the normal server connection was restored and retry recovery checked afterward.
- `buttons-confirmation-dark.png`: glossy red destructive action and refined dark charcoal Cancel in the existing confirmation sheet. Cancel was exercised; no receipt was deleted.

The purple face maintains at least 5.52:1 white-text contrast across the unpressed gradient; black reaches only 3.81:1. The frosting is a translucent surface treatment on the app's uniform backgrounds, without live backdrop blur. The API now selects numbered finish and colour independently. These existing flows map to 1/Purple, 2/Grey and 1/Red. The dark variant-2 border uses the reduced-lightness grey rim. Standard actions share the updated native surface; round navigation controls now follow the October 17 shared icon-button treatment. Build, lint, Kotlin formatting and the repository checks passed. No Android tests, harnesses or preview activities were added.

## Current receipt pager (October 12, 2026)

Unedited manual development-app captures on the Pixel 9 API 36 emulator. All and Needs attention are adjacent horizontal pages sharing the existing receipt data and row components, with one fixed Scan button outside both pages.

- `receipt-pager-half.png`: Both pages visible during a horizontal drag; header and Scan stay fixed.
- `receipt-pager-all.png`, `receipt-pager-attention.png`: Settled All and empty Needs attention pages.
- `receipt-pager-refresh.png`: Pull-to-refresh on Needs attention, with the full threshold ring above the content.
- `receipt-pager-large-text-dark.png`: Scrollable status copy at 2× text size on a compact 320×457dp screen, with Scan clear of the content.
- `receipt-pager-error.png`: Initial loading failure retains Scan alongside the retry action. A temporary local GET-only proxy supplied the failure; the normal server connection was restored afterward.

Normal captures are 1080×2424px at 420dpi; the compact capture is 840×1200px. Manual checks confirmed one accessible Scan control, hidden inactive-page content, tab navigation, preserved list scroll position after visiting and scrolling the other page, vertical refresh, error recovery, and receipt taps and holds. No Android tests or harnesses were added. These supersede the previous switch-on-release filter captures. Older empty and error captures below remain artwork references; their per-state Scan placement and hidden tabs on All 0 are superseded by this pager.

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
