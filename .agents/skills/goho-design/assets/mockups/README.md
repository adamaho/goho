# Mockups

## Launcher icons

The current family icon sources and Android resources are documented in the [launcher guide](../../references/launcher-icons.md). Its generator writes a colour and themed review sheet to ignored `.data/launcher-preview/launcher-icons.png`. Launcher preview sheets, exports, and unused candidates are not committed. The [character guide](../../references/characters.md) links the preserved individual and family PNG masters.

## Section navigation and add button (October 22, 2026, approved design)

Source: [October 22 design handoff](https://drive.google.com/file/d/1qV_D8jy56kDQ-hD3nW1luifS23GXKKEJ/view), `goho-design-2026-10-22.zip`. Design renders from the Goho brand canvas (“Goho navigation and add button”) at 360dp width and 2× (720×1480px), light and dark. They are approved design references, not emulator captures. The [section 7 spec](../../references/screens.md#7-section-navigation-and-add-button) wins where they differ. List rows are sample data; book rows follow the receipt row patterns and covers are illustrative. The generic Grey category tags in these navigation renders do not replace the server-provided category icons and colours. The title menu, switching sections from it and a display-only Books list are implemented; title swiping and book scanning remain planned. Native title-menu, Add and Books captures below show the implemented controls; older captures with Scan are historical for that control.

- `nav-title-light.png`, `nav-title-dark.png`: Receipts with the `SectionTitle` chevron and the round Add button.
- `nav-menu-receipts-light.png`, `nav-menu-receipts-dark.png`, `nav-menu-books-light.png`, `nav-menu-books-dark.png`: the section menu open from each section, current section tinted, with counts.
- `nav-swipe-halfway-light.png`, `nav-swipe-halfway-dark.png`: halfway through an upward title swipe from Receipts to Books; the title rolls and the content crossfades.
- `nav-add-closed-light.png`, `nav-add-closed-dark.png`: Books with the Add button at rest.
- `nav-add-menu-books-light.png`, `nav-add-menu-books-dark.png`, `nav-add-menu-receipts-light.png`, `nav-add-menu-receipts-dark.png`: the Add menu open (Scan book, Scan receipt) with the close mark and scrim.

## Title menu (native implementation)

Unedited Goho Dev captures from the Pixel 9 API 36 emulator using existing receipts from the local development server. Standard images are 1080×2424px at 420dpi. These show only the title menu as first implemented, when Books only dismissed with no count; the [Books list captures](#books-list-native-implementation) show the current switching and Books count. The title swipe remains future work.

- `section-title-native-light.png`: the title trigger with its chevron and unchanged filters/content.
- `section-menu-native-light.png`, `section-menu-native-dark.png`: anchored sheet surface, selected tint, receipt count, icon rows and light scrim above the list and Add.
- `section-menu-native-large-dark.png`: 320×640dp at 2× font scale (840×1680px). The menu grows to the available width; both names and the count fit without clipping.

Manual checks cover row, title, outside and Back dismissal; keyboard focus on Receipts and return to the title; large text and reduced motion; and preserving the current filter. The selected row retains an accessibility click action so it can dismiss like Books. The menu hides the underlying receipt/Add semantics and blocks their gestures while open. Build, lint and Kotlin formatting accompany these checks; no automated Android tests or harnesses were added or run.

Canonical source snapshots: `SectionTitle.kt`, `SectionMenu.kt`, `SectionScreen.kt`, `Spacing.kt`, `Shape.kt` and `Motion.kt` in `assets/compose/`. `SectionNavigation.kt` is a future title-swipe sketch, not the implementation.

## Books list (native implementation)

Display-only Books list reached from the title menu, using books from the local development seed (no covers). The dark and large-text captures also include temporary processing and failed upload rows; these were removed after manual validation. It follows [screens.md section 8](../../references/screens.md#8-books-list); the approved `nav-add-closed-*.png` and `nav-menu-books-*.png` renders above remain the design reference. Native captures from the Goho Dev emulator, added after validation:

- `books-native-light.png`, `books-native-dark.png`: seeded books with neutral cover placeholders, one-line titles, author and optional reading level, and server category tags.
- `books-menu-native-light.png`: the section menu opened from Books, Books selected, with Receipts' All count and the saved-book count.
- `books-native-loading-light.png`: the initial skeleton rows with Add in its usual position.
- `books-native-empty-light.png`: the text-only empty state.
- `books-native-error-light.png`: initial connection failure with the Books copy and retry action.
- `books-native-large-dark.png`: 2× font scale; tags move beneath the metadata and titles stay on one line.

Canonical source snapshots: `SectionScreen.kt`, `FilterPager.kt`, `ReceiptOverview.kt`, `BookOverview.kt`, `BookRow.kt`, `UploadTags.kt`, `CategoryIcon.kt`, `PullToRefresh.kt` and `Spacing.kt` in `assets/compose/`.

## Add button and menu (native implementation)

Unedited Goho Dev captures from the Pixel 9 API 36 emulator, using the local development server with existing receipts. The standard closed/light/dark captures include the refined 22dp icon. Normal captures are 1080×2424px at 420dpi; the large-text capture is 840×1680px (320×640dp) at 2× font scale.

- `add-button-native-light.png`: the persistent 60dp glossy Add button with its refined 22dp plus, 24dp from the end and 28dp above the bottom safe area.
- `add-menu-native-light.png`, `add-menu-native-dark.png`: the scrim, sheet-surface action pills and close icon. Scan book appears above Scan receipt. These Add captures predate the title menu; use the current title captures above for the header.
- `add-menu-native-large-dark.png`: earlier layout verification (before the 22dp icon refinement); both action names and icons remain visible at 2× text, while Add stays fixed at the bottom.
- `add-button-native-loading-light.png`: earlier layout verification (before the 22dp icon refinement); the existing loading preview shows the same skeleton components and exactly the same Add bounds as the populated list.

Add stays visibly pressed while the menu is open, with the shared 97% scale, 1dp lowering, darker fill and faded shadow. Purple glossy buttons use a violet lower shade (`#30266F` at 28%) in the face and inset reflection.

The screen overlay fades linearly over 240ms in and 180ms out, independent of the item animation; reduced motion snaps it. These static captures show its final opacity.

The menu now springs from 0.92 scale and rises 8dp with 45ms between entries, nearest Add first. Opening gives one ContextClick haptic, then a lighter SegmentTick for each entry at 45ms and 90ms. Closing reverses the stagger; reduced motion snaps without entry ticks.

Scan receipt calls the existing document scanner. Scan book deliberately only closes the menu, as requested by the user. No Books screen or book upload is implemented. Manual checks covered menu dismissal, the book no-op, scanner handoff, both themes, large text, reduced motion and loading placement. The emulator’s Google scanner returned a Play services error after handoff, so a complete capture/upload was not verified. Build, lint, Kotlin formatting and repository checks passed; no automated Android tests or harnesses were added or run.

Native source references: `assets/compose/AddButton.kt`, `AddMenu.kt`, `ReceiptOverview.kt`, `Spacing.kt` and `Motion.kt`. Menu icon vectors are in `assets/icons/navigation/`.

## Item category tags (October 21, 2026, approved design)

Source: [revised October 21 design handoff](https://drive.google.com/file/d/1GwsbJY8IJscVyHC61ArY7nvbv-vit1Uo/view). These are supplied design renders from the Goho brand canvas at 360dp width and 3×: list 1080×2340px, multi-category details 1080×4290px, single-category details 1080×3171px. They are approved design references, not emulator captures or evidence of an implemented feature. The [category component spec](../../references/components.md#category-tags) wins where they differ; retain the existing button finishes, filter styling, Scan safe-area placement and one-line, vertically centered item names at every font size. Details uses the item names from a real October 18 Costco receipt; categories and the other list rows are sample data.

- `category-list-light.png`, `category-list-dark.png`: top-spend category tag plus a Grey “+N” count beneath the price; single-category receipts show one tag; Processing and Not processed rows keep their upload tags.
- `category-details-light.png`, `category-details-dark.png`: Categories card (matching item icons, name, amount and share bar) between the photo and Items, then items in receipt order with a 24dp icon-only category tag before each name, the Total row and the Details card (Merchant, Date, Subtotal, Tax). No Category row.
- `category-details-single-light.png`: a single-category receipt keeps the Categories card with one full bar, so it still names the category.

Older captures with one category tag per row, or a Category row in Details, are historical.

## Receipt item category icons (native implementation)

These unedited Goho Dev captures use the Pixel 9 API 36 emulator at 1080×2424px and 420dpi, except the large-text capture below. The app rendered temporary, read-only sample API responses for all nine category colours, an unknown icon key, a negative amount and a long item name. Real dev-server receipt items were also checked. No records were created or changed.

- `category-items-native-light.png`, `category-items-native-dark.png`: 24dp icon-only tags before each item name, shared category palettes, right-aligned amounts and the existing Total row. Item names remain on one line and ellipsize when they exceed the available width. The name, amount and category tag share the row’s vertical center. Unknown icon keys use the Other tag icon.
- `category-items-native-large-text-dark.png`: 320×640dp with 2× font scale (840×1680px), scrolled to the long item. The icon stays fixed at 24dp and vertically centered with the name and amount. Names stay on one line with an ellipsis, amounts remain visible and the page scrolls. Accessibility retains the full item name.
- `category-items-native-loading-light.png`: The existing item rows and category icons under the shared skeleton scope. Accessibility exposes “Loading receipt…” and Back, without placeholder announcements.

Each loaded item exposes one accessible announcement containing its name, category display name and formatted amount. Manual checks covered all nine colours in both themes, unknown icons, large text, scrolling and loading. Android build, lint, Kotlin formatting and `pnpm check` passed; no automated Android tests or test harnesses were added or run. The canonical native snapshots are `Tag.kt`, `CategoryIcon.kt`, `ReceiptItemsCard.kt` and `Spacing.kt` in `assets/compose/`.

These captures show the implemented details item rows and predate the Categories card shown below. List/sheet category ranking and `TagCount` remain planned.

## Receipt category overview (native implementation)

These unedited Goho Dev captures use the Pixel 9 API 36 emulator at 1080×2424px and 420dpi, except the large-text capture. The app rendered temporary, read-only sample API responses; no records were created or changed. They show receipts without uploads, so Categories follows the hero directly. Uploaded receipts place the same card after the photo.

- `category-breakdown-native-light.png`, `category-breakdown-native-dark.png`: two categories with their shared icon tags, exact item sums and static share bars, followed by the existing item rows. Groceries is $69.41 (59%) and Household is $48.98 (41%); receipt-level tax is excluded from the shares.
- `category-breakdown-native-single-light.png`: one category keeps the card, its name and a full share bar.
- `category-breakdown-native-large-dark.png`: 320×640dp at 2× font scale (840×1680px), scrolled to a long category name. Category names wrap above their amounts, bars stay below them, and icons remain 24dp. Item names still use one line with an ellipsis. An unknown icon uses the Other fallback.
- `category-breakdown-native-loading-light.png`: the same category rows and bars use the shared delayed skeleton scope. Accessibility exposes only “Loading receipt…” and Back.
- `category-breakdown-native-refund-dark.png`: signed category amounts remain visible; all share bars and percentages are omitted when a category total is negative.

Manual checks covered light/dark, single and multiple categories, equal totals (including 0.1 + 0.2 tied with 0.3), zero totals, negative amounts, receipts without items, large text, scrolling and loading. Each category row exposes one non-interactive accessibility announcement; valid shares include a locale-formatted percentage. Receipts without items omit both Categories and Items. The canonical source snapshots are `CategoryBreakdown.kt`, `ReceiptCategorySummary.kt`, `CategoryIcon.kt` and `Spacing.kt` in `assets/compose/`.

## Shared list and bottom-sheet receipt summary (October 19, 2026)

The bottom-sheet header now uses the same `ReceiptSummary` as list rows: 40×48dp thumbnail, merchant/date on the left, amount with currency code and category/upload tag on the right. Menu and confirmation retain one mounted summary; the sheet adds no receipt tap action.

These unedited native Goho Dev captures use the local dev server on the Pixel 9 API 36 emulator (1080×2424px, 420dpi). Menu, confirmation, cancellation and opening from Details were checked without deleting any receipts.

- `receipt-summary-sheet-light.png`, `receipt-summary-sheet-dark.png`: Matching receipt presentation in the list and options-sheet header.
- `receipt-summary-confirm-light.png`, `receipt-summary-confirm-dark.png`: The same summary stays visible in confirmation.
- `receipt-summary-details-sheet-dark.png`: Details opens the same category-tag header.
- `receipt-summary-large-text-dark.png`: The shared stacked layout at 320×640dp and 2× font scale (840×1680px), with the amount, date, icon and category visible.

These supersede the larger, separate header in older sheet captures (including `receipt-tag-failed-sheet-dark.png`); older images remain references for their other named states. Canonical Compose sources are `ReceiptSummary.kt`, `ReceiptOptions.kt` and `ReceiptOptionsSheet.kt`.

## Shared category and upload tags (October 19, 2026, category display historical)

These unedited native Goho Dev screenshots come from the Pixel 9 API 36 emulator (1080×2424px at 420dpi, except the compact captures below). The regular app rendered temporary, read-only sample API responses for the nine colours and upload states; no records were created or changed. The normal dev-server receipts were also checked. No separate preview activity, Android tests or test harness was added.

- `receipt-tags-light.png`, `receipt-tags-dark.png`: Categories beneath the right-aligned price, required leading icons, Purple processing and Orange failure tags. These supersede the old fully rounded status pills in earlier screenshots.
- `receipt-tags-more-light.png`, `receipt-tags-more-dark.png`: Remaining colours, the Grey fallback for a long unknown category, and no tag for a blank category. Long names wrap while the date retains space.
- `receipt-tag-detail-light.png`, `receipt-tag-detail-dark.png`: The same Home icon/colour tag in Details. Tapping the list tag opened this receipt; it does not introduce a separate action.
- `receipt-tag-failed-sheet-dark.png`: Tapping “Not processed” still opens receipt options; the sheet uses the same shared warning tag. The sheet was dismissed without deleting anything.
- `receipt-tags-large-text-dark.png`, `receipt-tags-long-large-text-dark.png`: 320×640dp, 2× font scale, animations disabled (840×1680px). Labels wrap, icons remain present and rows scroll. The amount and tag stay right-aligned in the stacked layout. Processing-tag pixels were unchanged across two captures with animations disabled.
- `receipt-tags-loading-light.png`: Existing list rows and their tag elements under the shared skeleton scope, with real server reads temporarily delayed. Scan remains at the fixed bottom/end inset.

These captures use the labelled `Tag`: a display-only primitive requiring a Painter, label and one of nine `TagColor` values. The current API also provides an icon-only overload with a required content description. Category and receipt-upload wrappers supply their existing labels and icon/colour mappings. See `references/components.md`, `references/tokens.md`, the mirrored Compose sources and `assets/icons/tags/README.md` for the API, measurements, palette and Lucide attribution. Scan preview's existing upload status copy also uses the component; that capture/upload interaction was not exercised in this screenshot session.

Manual checks covered both palettes, all category colours, long/unknown and blank categories, tag-area navigation, failed-row options, narrow/large-text layout, static reduced-motion tags and initial skeleton loading. Android build, lint and Kotlin formatting passed. Older captures remain references for their named interactions or artwork; this section is the current upload-tag reference, and its category tags are historical.

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

The standard closed/light/dark captures include the refined 22dp icon. Normal captures are 1080×2424px at 420dpi; the compact capture is 840×1200px. Manual checks confirmed one accessible Scan control, hidden inactive-page content, tab navigation, preserved list scroll position after visiting and scrolling the other page, vertical refresh, error recovery, and receipt taps and holds. No Android tests or harnesses were added. These supersede the previous switch-on-release filter captures. Older empty and error captures below remain artwork references; their per-state Scan placement and hidden tabs on All 0 are superseded by this pager.

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

## Section menu closing frames (October 22, 2026)

- `section-menu-close-native-light.png`: selected frames from a normal-speed native recording, cropped to the header and top rows. The outgoing Books title, selected menu row and page remain stable until the popup finishes closing; Receipts appears afterward.
- `section-menu-close-native-dark.png`: the same close in dark mode, captured with Android animator duration temporarily set to 4× to inspect the fade. The menu face, rows and shadow fade together. Normal animation speed was restored after capture.

These are cropped native Pixel 9 API 36 emulator frames with frame numbers and original video timestamps, not redrawn layouts or a frame-rate benchmark. The popup has one shared parent outside the section bodies. The existing open-menu captures remain valid for its settled appearance.
