# Goho components

Deletion components and row interactions describe the October 2 v2 target design. Verify server support and implement them only as part of a requested deletion feature.

Reference implementations live in `assets/compose/GohoComponents.kt`. Every pressable uses the Goho press (`Modifier.gohoPressTransform`) with `indication = null`. Only the components below are needed; don't add others without a design.

## GohoScanFab

- 56 tall, shape `fab` 24, padding 18 left / 22 right.
- Fill: glossy `buttonPrimary`; pressed `buttonPrimaryPressed`. Edge and shadow: the shared `GohoButtonSurface.kt` treatment in `tokens.md` (bright upper rim, inset reflection, darker lower edge, soft wide shadow).
- Content: scan icon 22dp, 9dp gap, "Scan" in `button` style, color `onButtonPrimary`. Content description "Scan receipt".
- Placed bottom right over the list without a bottom gradient. Keep enough list padding for the final row to scroll clear of the button.

## GohoActionButton

Use one shared component for standard actions. The finish is `variant: Int = 1`, restricted to 1 or 2 by annotation and a runtime check. Colour is independent: `color: GohoButtonColor = GohoButtonColor.Purple`, with `Purple`, `Red`, and `Grey`. All six combinations are supported. Scan keeps its specialized layout and uses variant 1 / Purple through the same surface. Icon-only actions use `GohoIconButton` with the same surface and palette; they keep a compact round layout.

```kotlin
GohoActionButton("Upload receipt", onUpload, variant = 1, color = GohoButtonColor.Purple)
GohoActionButton("Cancel", onCancel, variant = 2, color = GohoButtonColor.Grey)
GohoActionButton("Delete receipt", onDelete, variant = 1, color = GohoButtonColor.Red)
```

- Variant 1: glossy face, bright upper rim, inset reflection, soft wide shadow; weight 600 label.
- Variant 2: frosted finish in light mode, almost flat face with a dim grey outer rim meeting the face directly in dark mode; quieter shadows and weight 500 label. The base colour is still selected independently.
- Purple uses `buttonPrimary` / `buttonPrimaryPressed` and white `onButtonPrimary`; red uses `danger` / `dangerPressed` and white `onDanger`; grey uses `buttonSecondary` / `buttonSecondaryPressed` with `textPrimary`. Red remains reserved for destructive actions in product flows.
- Full width inside the screen margin, at least 52dp tall, shape `button` 20 (not a pill), horizontal padding 20.
- Optional decorative icon slot: the button supplies `LocalContentColor` from the chosen palette. Material icons and `UploadIcon` inherit it; custom drawing should read it too. Use 18dp icons and an 8dp gap.
- The shared `GohoButtonColor.kt` palette resolver owns fill, pressed fill, content tint and shadow colour. `GohoButtonSurface.kt` applies the numbered finish; screens do not implement their own styling.
- Existing primary actions map to 1 / Purple, secondary actions to 2 / Grey, and destructive confirmation to 1 / Red. Stack actions with a 10dp gap.
- Disabled: whole button at 40% alpha, no press, not clickable.
- Loading: replace the label with an 18dp loading icon in the chosen colour palette's content colour. The receipts retry action does this after the shared 200ms delay. Keep both labels measured so the button bounds remain stable, expose “Trying again…” and indeterminate progress, and keep the icon itself decorative. Callers disable immediately while work is pending.

## Status content (empty and error states)

- Full width inside the screen margin, padding 28 top / 24 sides / 32 bottom (24 bottom when it has a button). Content centered directly on the screen background. No enclosing card fill, border or rounded clipping in any list status state.
- Use the shared status content for no receipts, needs attention and load error. Preserve the shared padding, spacing, entrance and centered placement; the Scan footer stays separate when present.
- No receipts, empty Needs attention and load error each show an illustration (220×190dp), followed by a 4dp gap before the title. Title is 20/26 SemiBold −0.02em `textPrimary`, followed by a 6dp gap before body text in `body` `textSecondary` (max width 290dp), then an optional full-width button 22dp below.
- Illustration assets live in `assets/illustrations/`. No receipts uses `status-no-receipts.png`; empty Needs attention uses the calm thumbs-up `status-needs-attention.png`; load error uses the gentle shrug `status-load-error.png`. All three PNGs are 1350×1165 RGBA, with each state using the same transparent asset in both themes. Preserve the artwork unchanged and render with `ContentScale.Fit` in the existing slot up to 220dp wide with a 220:190 aspect ratio. These three poses are the only production Bram artwork. The neutral stance and former header mark are design identity references only; dedicated artwork for other states is deferred until its feature is implemented. The older SVGs in `legacy/` are not sources for these Bram images.
- The illustration is decorative (`contentDescription = null`); the title is a heading and the title/body group carries the meaning. Only the load-error content is a polite live region.
- Entrance: one 200ms fade with a 6dp upward settle; no looping character animation. Successful retry crossfades the whole error screen to the loaded state in 200ms without replaying the incoming status entrance. With reduced motion, render the final state immediately.
- The retry button reserves space for both “Try again” and “Trying again…” at the current font scale, including 2× text. Hidden measurement labels have no semantics. Disable immediately, retain “Try again” for 200ms, then replace it with a centered loading icon while the request is actually pending. Failure restores “Try again” in place. Keep actual loading separate from the disabled outgoing recovery screen.

## GohoSkeletonScope and Modifier.gohoSkeleton

Reference: `assets/compose/GohoSkeleton.kt`; production: `ui/components/GohoSkeleton.kt`.

- Use one scope around the existing loading content. The scope shares a reduced-motion-aware shimmer and the 200ms visibility delay. Nested scopes inherit the active parent so photo loading does not restart the whole screen's shimmer.
- Add the modifier to existing Text and clipped image elements. Preserve their measurement; minimum-width tokens only apply while loading. Draw text masks at 60% of line height, with logical start/end alignment and 4dp corners. Images fill their existing bounds.
- Clear placeholder semantics and put a single polite indeterminate progress description on the enclosing loading region. Keep navigation outside it and disable content actions until data exists.
- Null row/item data reserves the same normal layout; never construct fake receipt objects. Keep already loaded content visible during background refreshes.

## GohoLoadingIcon (retry actions)

- A 2dp stroked arc, 18dp in `onButtonPrimary` inside the retry button. Rotate once every 1000ms; use a static arc with reduced motion.
- Reveal only after 200ms of uninterrupted actual loading. Cancel on completion, failure or disposal and restart the delay for each attempt.
- Retry exposes “Trying again…” and progress on the button; the nested icon is decorative. Initial list and detail loading use skeletons.

## GohoSheet (floating bottom sheet)

- Floats inset from the screen: 8dp from the left, right and bottom edges (plus the navigation bar inset), shape `sheet` 28 on all corners, fill `sheet`, shadow per tokens. Scrim `scrim` behind it.
- Grabber: 36×4, fully round, `grabber`, 8dp from the top, centered.
- Drag down or tap the scrim to dismiss (except while a delete is in progress). Back gesture dismisses.
- Keep the receipt header mounted across states. Confirmation has no title, large icon or description; buttons appear together directly below the shared header without stagger or bounce.
- Content changes inside the same sheet animate their height (`animateContentSize`, about 280ms) instead of opening a second sheet. The receipt options sheet's header and states are specified in `screens.md` section 5.
- Implementation hint: M3 `ModalBottomSheet` with `containerColor = Color.Transparent`, `dragHandle = null`, `tonalElevation = 0.dp`, `scrimColor = scrim`, and the content wrapped in a padded, clipped, `sheet`-colored Box.

## GohoSheetMenuItem

- A traditional list item inside a sheet: 56dp tall, 20dp side padding, 16dp gap, 22dp leading icon, label 16sp Medium. Pressed: `surfacePressed` (light) / `surfaceMutedPressed` (dark), no ripple.
- Destructive tone (the only one used today): icon and label in `onDangerContainer`.
- Items sit in a list under a `divider` inset 20dp, with 6dp top and 8dp bottom padding.

## GohoIconButton (round)

- Shared icon-only API: required `contentDescription`, `onClick` and decorative `icon` slot; optional `modifier`, `variant` (1 or 2, default 2), `color` (Purple, Red or Grey, default Grey), `enabled` and visual `opacity` lambda.
- 44dp circle using `GohoShapes.pill` and the exact `GohoButtonSurface` finish used by labelled action buttons. Back and overflow use variant 2/Grey, with 20dp icons inheriting `LocalContentColor`. Preserve RTL mirroring for Back.
- Shares the 97% press scale, 1dp drop, reduced-motion support, no ripple and 40% disabled appearance. Disabled controls cannot be activated. The outer button owns its accessible label and role; icon descendants are decorative.
- Visual opacity fades only the drawing, retaining the touch target and TalkBack node for photo controls. Reference: `assets/compose/GohoIconButton.kt`.

## ReceiptFilter

- Separate tabs below the title, with a 6dp gap and no enclosing track. The selected tab has a subtle pill surface; unselected tabs blend into the header background.
- Show filters when entries exist or Needs attention is selected, even after deleting the last failed receipt. Hide them for a load error and for the unfiltered empty list. Let “Needs attention” wrap at larger font sizes instead of truncating it.
- Tab: 36dp visible pill within a minimum 44dp tap target, 10dp horizontal padding, fully round, text 13sp weight 500.
- Selected: fill `segmentSelected`, 1dp shadow (plus a 6% top highlight in dark only), text `textPrimary`. Unselected: visually blends into `background`, text `textSecondary`. Animate an opaque surface between `background` and `segmentSelected`; never fade a shadowed surface through transparency. Use a gentle spring for the fill reveal while keeping label geometry and touch targets fixed. Synchronize elevation, highlight and label color with the same selection progress, clamped to 0–1; only the fill scale may overshoot.
- "All" shows its count in `textSecondary` after a 5dp gap. "Needs attention" shows a count badge: min 20×20, fully round, `attentionContainer` fill, `attention` text, `label` style. Hide the badge when the count is 0.

## GohoStatusPill

- Height at least 22, horizontal padding 9, fully round, `label` style. Center the visible glyph bounds so font ascent/descent does not make text look off-center.
- Tones: `Accent` (`accentContainer` / `onAccentContainer`) for "Reading receipt…", with the shimmer; `Attention` (`attentionContainer` / `attention`) for "Not processed".

## ReceiptThumbnail

- 40×48, shape `thumb` 8, image cropped center, 1dp border in `outline`.
- Processing: overlay the top 45% with `accent` at 18% and draw a 1.5dp `accent` line at its bottom edge (a static "scan line").
- Missing photo (including manually created receipts): `surfaceMuted` with a centered receipt outline in `textSecondary`.
- Processing without a photo: `accentContainer` with a receipt outline and scan line in `onAccentContainer`.
- Failed upload: `attentionContainer` with a receipt outline and attention mark in `attention`.
- Placeholder icons are decorative; the row and status pill provide the accessible description.

## ReceiptRow

Row inside a card: `thumbnail | column(line 1, line 2)`.

- Line 1: merchant (`rowTitle`, `textPrimary`, single line, ellipsis) … trailing amount (`rowTitle`, proportional figures).
- Line 2 (5dp below): date (`meta`, `textTertiary`) … optional trailing status pill.
- States:
  - **Processed:** amount in `textPrimary`. The symbol and number use `textPrimary`; the trailing currency code is smaller (12sp) in `textTertiary`. Tappable; opens details.
  - **Processing:** merchant "New receipt", date "Just now", trailing amount replaced by a 52×12 fully round shimmering skeleton, pill "Reading receipt…". Not tappable.
  - **Not processed:** merchant "Unknown receipt", amount "—" in `textTertiary`, pill "Not processed". Tappable; opens the receipt options sheet (it has no details screen).
- Pressed receipt rows retain their normal surface fill with no highlight. Holds use the scale feedback below; cards clip their rows to the card's corners.
- Press and hold (Processed and Not processed rows; Processing rows ignore it): once it's clear the press is a hold (after about 150ms), ease to scale 0.98. Keep the normal surface fill throughout; no pressed highlight. When the long-press fires (the system long-press timeout, about 400–500ms): `HapticFeedbackType.LongPress`, the row springs back to scale 1, and the receipt options sheet opens. Releasing before the timeout is a normal tap. Implement with `Modifier.combinedClickable(onClick, onLongClick, onLongClickLabel = "Receipt options")` so TalkBack offers the action.
- Each row has a merged content description, for example "Cedar Hardware, US$23.21, Thursday September 24" or "Unknown receipt, not processed, today 8:14 AM".

## ReceiptCard (section)

- Section label above: `section` style, `textTertiary`, inset 4dp inside the screen margin (20dp from the edge), 8dp below.
- Card: `surface`, shape `card` 20, 4dp vertical padding. Edge treatment per theme (see Elevation in `tokens.md`). Rows separated by `divider` lines starting at 68dp.

## DetailList

- Card like above with 16dp horizontal padding. Rows 47 tall: label (`listRow`, `textSecondary`) left, value (`listRow` weight 500, `textPrimary`, proportional figures) right, dividers between rows. Read-only.
- A value that wasn't read shows "—" in `textTertiary`. Allow rows to grow for wrapped values; stack labels above values on narrow screens or with larger text.

## ItemsCard

The receipt's line items, given the same card treatment as Details so they read as primary content.

- Card like ReceiptCard: `surface`, shape `card` 20, theme edge treatment, 16dp horizontal padding, 2dp top padding.
- Item row: padding 14 top and bottom, 16dp gap. Name on the left (`listRow` at weight 400, `textPrimary`, up to 2 lines then ellipsis, top aligned). Line total on the right (`listValue`, `textPrimary`, proportional figures, no wrapping, currency symbol without a trailing code, always two decimals). Hairline `divider` between item rows, spanning the card's inner width.
- Total row last: separated by a stronger 1dp rule (`textPrimary` at 10% in dark, 12% in light), padding 14 top / 16 bottom. "Total" in 15sp weight 600; amount in 17/22 weight 600, tracking −0.01em, proportional figures, with the currency symbol (no trailing code).
- Each item amount and the card Total use the receipt currency symbol without repeating the code; the code appears once in the details hero.
- If an item has no amount, show "—" in `textTertiary`.

## Money formatting

One formatter for every amount in the app (list rows, hero, items, total):

- Exactly two fraction digits: `minimumFractionDigits = 2`, `maximumFractionDigits = 2`, half-even rounding, grouping separators on ("1,204.50").
- Symbol and amount followed by the smaller subdued currency code: “$46.78 CAD” or “$23.21 USD”. Show this trailing code only in the details hero and receipt-list totals. Other amounts retain the symbol without the code. Unknown codes omit the symbol, and missing amounts show only “—”.
- Item lines: symbol and number ("$3.50"), without a trailing currency code.
- Missing: "—", never "0.00".

## PhotoFrame

- Full width inside the screen margin, shape `card` 20, radial gradient `photoWellCenter` → `photoWellEdge` behind the photo (drawn with `ContentScale.Fit`).
- The loaded photo area is the viewer tap target, with a “View receipt photo” accessibility action and Goho press feedback. Do not draw an expand button. Loading and missing photos have no click action.

## GohoPhotoControlButton

- The close button in the photo viewer.
- Delegates to `GohoIconButton` with variant 2/Grey under the dark Goho theme in both app themes, because it sits on the dark photo well. Uses the shared 44dp circle, charcoal face, grey rim, shadow and 20dp close icon.
- Preserve visual fade, close semantics and the Goho press; no separate photo-button surface.

## Icons

Material Symbols **Rounded** (`material-icons-extended` `Icons.Rounded.*`) at weight around 500 so strokes match Geist: back `AutoMirrored.Rounded.ArrowBack`, close `Close`, overflow `MoreHoriz`, delete `Delete` (outlined trash), scan `DocumentScanner` (or a custom four-corner viewfinder with a center line, which is what the mockup shows).

## GohoPullToRefresh

Keep the loading arc rotating continuously through the 200ms minimum and the entire bounce-to-zero exit. Stop only when it is invisible or changes to the warning triangle; honour Remove animations.

Use the production `ui/components/GohoPullToRefresh.kt` and the matching `assets/compose/GohoPullToRefresh.kt` reference. The container uses Material 3's `pullToRefresh` nested-scroll modifier for gesture arbitration and draws a Goho indicator. Wrap existing scrollable content; do not introduce a second list layout. Keep the fixed header and floating Scan outside the container. `refreshing` identifies user-initiated work independently of the ordinary loading flag; `failed` supplies its outcome. The component completes its pull ring and gives one threshold haptic, pins a spinning arc during work for a minimum of 200ms, and morphs into an orange warning triangle for three seconds on failure. Bounce into view from zero through 108% to 100%. On completion, bounce to 108% then shrink to zero with a fade in place; keep the content gap open until invisible. It reserves space above the content and leaves the header and footer anchored. Background failures do not activate this indicator; disable new pulls while a request is pending. Supply a Refresh receipts accessibility action for users who cannot perform the gesture.

## Receipt pager and persistent Scan

Use the HorizontalPager in production `ui/main/ReceiptOverview.kt`, mirrored in `assets/compose/ReceiptOverview.kt`. Each page uses the same ReceiptListPage composable with its own retained rows and vertical scroll state; receipt data and thumbnails remain shared. Keep both pages composed. ReceiptListHeader selects the pager’s current page and animates tab selections. GohoPullToRefresh wraps the pager, while a single ScanButton is a sibling of the screen content, outside the pager and error-recovery transitions. Do not create per-page Scan buttons or reset a page’s scroll position when changing tabs.
