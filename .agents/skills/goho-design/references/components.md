# Goho components

Name UI components by their role, never with a `Goho` prefix: `Tag`, `ActionButton`, `IconButton`, `SectionTitle`, `SectionMenu`, `AddButton`, `AddMenu`, `SkeletonScope` and `PullToRefresh`. Use the same convention for component-specific types (`TagColor`, `ButtonColor`) and matching filenames. Keep call sites, examples and Compose references aligned.

Deletion components and row interactions describe the October 2 v2 target design. Verify server support and implement them only as part of a requested deletion feature.

Reference implementations live in `assets/compose/Components.kt`. Every pressable uses the Goho press (`Modifier.pressTransform`) with `indication = null`. Only the components below are needed; don't add others without a design.

## ScanFab (historical)

Replaced in the native app by `AddButton` and `AddMenu` (below). This section and the old combined `Components.kt` Scan example are historical.

- 56 tall, shape `fab` 24, padding 18 left / 22 right.
- Fill: glossy `buttonPrimary`; pressed `buttonPrimaryPressed`. Edge and shadow: the shared `ButtonSurface.kt` treatment in `tokens.md` (bright upper rim, inset reflection, darker lower edge, soft wide shadow).
- Content: scan icon 22dp, 9dp gap, "Scan" in `button` style, color `onButtonPrimary`. Content description "Scan receipt".
- Placed bottom right over the list, 24dp from the end edge and 28dp above the navigation bar inset, without a bottom gradient. Keep enough list padding for the final row to scroll clear of the button.

## ActionButton

Use one shared component for standard actions. The finish is `variant: Int = 1`, restricted to 1 or 2 by annotation and a runtime check. Colour is independent: `color: ButtonColor = ButtonColor.Purple`, with `Purple`, `Red`, and `Grey`. All six combinations are supported. The round Add button keeps its specialized layout and uses variant 1 / Purple through the same surface. Icon-only actions use `IconButton` with the same surface and palette; they keep a compact round layout.

```kotlin
ActionButton("Upload receipt", onUpload, variant = 1, color = ButtonColor.Purple)
ActionButton("Cancel", onCancel, variant = 2, color = ButtonColor.Grey)
ActionButton("Delete receipt", onDelete, variant = 1, color = ButtonColor.Red)
```

- Variant 1: glossy face, bright upper rim, inset reflection, soft wide shadow; weight 600 label.
- Variant 2: frosted finish in light mode, almost flat face with a dim grey outer rim meeting the face directly in dark mode; quieter shadows and weight 500 label. The base colour is still selected independently.
- Purple uses `buttonPrimary` / `buttonPrimaryPressed` and white `onButtonPrimary`; red uses `danger` / `dangerPressed` and white `onDanger`; grey uses `buttonSecondary` / `buttonSecondaryPressed` with `textPrimary`. Red remains reserved for destructive actions in product flows.
- Full width inside the screen margin, at least 52dp tall, shape `button` 20 (not a pill), horizontal padding 20.
- Optional decorative icon slot: the button supplies `LocalContentColor` from the chosen palette. Material icons and `UploadIcon` inherit it; custom drawing should read it too. Use 18dp icons and an 8dp gap.
- The shared `ButtonColor.kt` palette resolver owns fill, pressed fill, content tint, shadow colour and glossy lower shade. Purple uses a violet lower shade for both the face and inner edge. `ButtonSurface.kt` applies the numbered finish; screens do not implement their own styling.
- Existing primary actions map to 1 / Purple, secondary actions to 2 / Grey, and destructive confirmation to 1 / Red. Stack actions with a 10dp gap.
- Disabled: whole button at 40% alpha, no press, not clickable.
- Loading: replace the label with an 18dp loading icon in the chosen colour palette's content colour. The receipts retry action does this after the shared 200ms delay. Keep both labels measured so the button bounds remain stable, expose “Trying again…” and indeterminate progress, and keep the icon itself decorative. Callers disable immediately while work is pending.

## Status content (empty and error states)

- Full width inside the screen margin, padding 28 top / 24 sides / 32 bottom (24 bottom when it has a button). Content centered directly on the screen background. No enclosing card fill, border or rounded clipping in any list status state.
- Use the shared status content for no receipts, needs attention and load error. Preserve the shared padding, spacing, entrance and centered placement; the Add button stays separate when present.
- No receipts, empty Needs attention and load error each show an illustration (220×190dp), followed by a 4dp gap before the title. Title is 20/26 SemiBold −0.02em `textPrimary`, followed by a 6dp gap before body text in `body` `textSecondary` (max width 290dp), then an optional full-width button 22dp below.
- Illustration assets live in `assets/illustrations/`. No receipts uses `status-no-receipts.png`; empty Needs attention uses the calm thumbs-up `status-needs-attention.png`; load error uses the gentle shrug `status-load-error.png`. All three PNGs are 1350×1165 RGBA, with each state using the same transparent asset in both themes. Preserve the artwork unchanged and render with `ContentScale.Fit` in the existing slot up to 220dp wide with a 220:190 aspect ratio. These three poses are the only production Bram artwork. The neutral stance and former header mark are design identity references only; dedicated artwork for other states is deferred until its feature is implemented. The older SVGs in `legacy/` are not sources for these Bram images.
- The illustration is decorative (`contentDescription = null`); the title is a heading and the title/body group carries the meaning. Only the load-error content is a polite live region.
- Entrance: one 200ms fade with a 6dp upward settle; no looping character animation. Successful retry crossfades the whole error screen to the loaded state in 200ms without replaying the incoming status entrance. With reduced motion, render the final state immediately.
- The retry button reserves space for both “Try again” and “Trying again…” at the current font scale, including 2× text. Hidden measurement labels have no semantics. Disable immediately, retain “Try again” for 200ms, then replace it with a centered loading icon while the request is actually pending. Failure restores “Try again” in place. Keep actual loading separate from the disabled outgoing recovery screen.

## SkeletonScope and Modifier.skeleton

Reference: `assets/compose/Skeleton.kt`; production: `ui/components/Skeleton.kt`.

- Use one scope around the existing loading content. The scope shares a reduced-motion-aware shimmer and the 200ms visibility delay. Nested scopes inherit the active parent so photo loading does not restart the whole screen's shimmer.
- Add the modifier to existing Text and clipped image elements. Preserve their measurement; minimum-width tokens only apply while loading. Draw text masks at 60% of line height, with logical start/end alignment and 4dp corners. Images fill their existing bounds.
- Clear placeholder semantics and put a single polite indeterminate progress description on the enclosing loading region. Keep navigation outside it and disable content actions until data exists.
- Null row/item data reserves the same normal layout; never construct fake receipt objects. Keep already loaded content visible during background refreshes.

## LoadingIcon (retry actions)

- A 2dp stroked arc, 18dp in `onButtonPrimary` inside the retry button. Rotate once every 1000ms; use a static arc with reduced motion.
- Reveal only after 200ms of uninterrupted actual loading. Cancel on completion, failure or disposal and restart the delay for each attempt.
- Retry exposes “Trying again…” and progress on the button; the nested icon is decorative. Initial list and detail loading use skeletons.

## Sheet (floating bottom sheet)

- Floats inset from the screen: 8dp from the left, right and bottom edges (plus the navigation bar inset), shape `sheet` 28 on all corners, fill `sheet`, shadow per tokens. Scrim `scrim` behind it.
- Grabber: 36×4, fully round, `grabber`, 8dp from the top, centered.
- Drag down or tap the scrim to dismiss (except while a delete is in progress). Back gesture dismisses.
- Keep the receipt header mounted across states. Confirmation has no title, large icon or description; buttons appear together directly below the shared header without stagger or bounce.
- Content changes inside the same sheet animate their height (`animateContentSize`, about 280ms) instead of opening a second sheet. The receipt options sheet's header and states are specified in `screens.md` section 5.
- Implementation hint: M3 `ModalBottomSheet` with `containerColor = Color.Transparent`, `dragHandle = null`, `tonalElevation = 0.dp`, `scrimColor = scrim`, and the content wrapped in a padded, clipped, `sheet`-colored Box.

## SheetMenuItem

- A traditional list item inside a sheet: 56dp tall, 20dp side padding, 16dp gap, 22dp leading icon, label 16sp Medium. Pressed: `surfacePressed` (light) / `surfaceMutedPressed` (dark), no ripple.
- Destructive tone (the only one used today): icon and label in `onDangerContainer`.
- Items sit in a list under a `divider` inset 20dp, with 6dp top and 8dp bottom padding.

## IconButton (round)

- Shared icon-only API: required `contentDescription`, `onClick` and decorative `icon` slot; optional `modifier`, `variant` (1 or 2, default 2), `color` (Purple, Red or Grey, default Grey), `enabled` and visual `opacity` lambda.
- 44dp circle using `GohoShapes.pill` and the exact `ButtonSurface` finish used by labelled action buttons. Back and overflow use variant 2/Grey, with 20dp icons inheriting `LocalContentColor`. Preserve RTL mirroring for Back.
- Shares the 97% press scale, 1dp drop, reduced-motion support, no ripple and 40% disabled appearance. Disabled controls cannot be activated. The outer button owns its accessible label and role; icon descendants are decorative.
- Visual opacity fades only the drawing, retaining the touch target and TalkBack node for photo controls. Reference: `assets/compose/IconButton.kt`.

## ReceiptFilter

- Separate tabs below the title, with a 6dp gap and no enclosing track. The selected tab has a subtle pill surface; unselected tabs blend into the header background.
- Show filters when entries exist or Needs attention is selected, even after deleting the last failed receipt. Hide them for a load error and for the unfiltered empty list. Let “Needs attention” wrap at larger font sizes instead of truncating it.
- Tab: 36dp visible pill within a minimum 44dp tap target, 10dp horizontal padding, fully round, text 13sp weight 500.
- Selected: fill `segmentSelected`, 1dp shadow (plus a 6% top highlight in dark only), text `textPrimary`. Unselected: visually blends into `background`, text `textSecondary`. Animate an opaque surface between `background` and `segmentSelected`; never fade a shadowed surface through transparency. Use a gentle spring for the fill reveal while keeping label geometry and touch targets fixed. Synchronize elevation, highlight and label color with the same selection progress, clamped to 0–1; only the fill scale may overshoot.
- "All" shows its count in `textSecondary` after a 5dp gap. "Needs attention" shows a count badge: min 20×20, fully round, `attentionContainer` fill, `attention` text, `label` style. Hide the badge when the count is 0.

## ReceiptThumbnail

- 40×48, shape `thumb` 8, image cropped center, 1dp border in `outline`.
- Processing: overlay the top 45% with `accent` at 18% and draw a 1.5dp `accent` line at its bottom edge (a static "scan line").
- Missing photo (including manually created receipts): `surfaceMuted` with a centered receipt outline in `textSecondary`.
- Processing without a photo: `accentContainer` with a receipt outline and scan line in `onAccentContainer`.
- Failed upload: `attentionContainer` with a receipt outline and attention mark in `attention`.
- Placeholder icons are decorative; the row and status tag provide the accessible description.

## Tag

Canonical references: `assets/compose/Tag.kt`, `TagColor.kt`, `ReceiptTags.kt` and `CenteredPillLabel.kt` mirror the existing native tag and upload-state implementation. The older combined `Components.kt` delegates receipt tags to those components. The shared `Tag` also has an icon-only overload with required `icon`, `color` and `contentDescription`, plus optional `modifier`. Both forms use the same surface, palette and corners. `CategoryIcon.kt` maps server metadata into that overload, and `ReceiptItemsCard.kt` shows the native details layout. `CategoryBreakdown.kt` and `ReceiptCategorySummary.kt` mirror the native Categories card and exact-decimal aggregation. List/sheet category ranking and `TagCount` remain approved specifications below, not implemented snapshots.

```kotlin
Tag(
    label = "Groceries",
    icon = painterResource(R.drawable.ic_tag_groceries), // required Painter; no default
    color = TagColor.Green,
)
ReceiptUploadTag(processing = true)
```

- API: `label: String`, required `icon: Painter`, `color: TagColor`, optional `modifier` and `shimmer: Boolean = false`. No click handler or selection state. The only other tag shapes are `TagCount` and `CategoryIcon` under “Category tags” below. A tag is display metadata; the surrounding receipt retains its tap and hold actions.
- Rectangular `GohoShapes.tag` with 4dp corners, minimum height 24dp, 8dp horizontal / 4dp vertical padding, 14dp leading outline icon, 5dp gap. No border, shadow, gloss or ripple. `label` typography is 12/16sp Medium with proportional figures; optically centre the glyphs and icon together.
- Label and icon use the palette content colour. The icon is decorative for accessibility; the visible label conveys the category or state, including without colour. Merge tag semantics, and retain the parent row's merged receipt announcement.
- Tags grow for font scaling and wrap long names. On standard receipt rows cap the tag at 160dp so the date has room. At narrow widths or font scale ≥1.3, stack merchant, right-aligned amount/tag, then date. Do not truncate category names or create another tap target.
- Category display (approved October 21, 2026) is specified under “Category tags” below. Copy the server name into the list model, trim surrounding whitespace and capitalise its first character for display (“personal care” → “Personal care”).
- Receipt options reuse `ReceiptSummary`, the same presentation as the list row: merchant/date on the left, amount and category or upload tags on the right, and the same 40×48dp thumbnail. It stays in the shared header during delete confirmation, whether opened from the list or Details. Long labels wrap as they do in the list.
- `ReceiptUploadTag` uses Purple + scan-line for “Reading receipt…” and Orange + triangle-alert for “Not processed”. Keep the existing reduced-motion-aware text shimmer while processing; its highlight blends 4% toward the container so every palette remains readable. Icons remain still. The failed-upload sheet uses the same tag. Scan preview's existing uploading/submitted/failure copy uses `Tag` with the corresponding scan or warning icon; Ready has no tag.
- Skeleton loading masks the same tag element, clearing placeholder semantics. The tag still has an icon parameter while loading; no separate skeleton layout.
- Nine theme-aware colour pairs live in `TagColor`, separate from the three action-button colours. See `tokens.md`. Icon masters, Android resource mapping and licence are in `assets/icons/tags/README.md`.

## ReceiptRow

`ReceiptSummary` owns the shared content, date formatting, amount and tags for list rows and the bottom-sheet header. The list wrapper owns tap/hold feedback and card padding; the sheet keeps the same content display-only and mounted above its changing actions. Canonical references: `assets/compose/ReceiptSummary.kt`, `ReceiptOptions.kt` and `ReceiptOptionsSheet.kt`.

Row inside a card: `thumbnail | column(line 1, line 2)`.

- Line 1: merchant (`rowTitle`, `textPrimary`, single line, ellipsis) … trailing amount (`rowTitle`, proportional figures).
- Line 2 (5dp below): date (`meta`, `textTertiary`) … right-aligned tags beneath the price: the upload-state tag, or for processed receipts the top-spend category `Tag` and optional `TagCount` (see Category tags).
- States:
  - **Processed:** amount in `textPrimary`. The symbol and number use `textPrimary`; the trailing currency code is smaller (12sp) in `textTertiary`. Top-spend category `Tag`, plus `TagCount` when there are more categories. Tappable; opens details.
  - **Processing:** merchant "New receipt", date "Just now", trailing amount replaced by a 52×12 fully round shimmering skeleton, Purple scan-icon tag "Reading receipt…". Not tappable.
  - **Not processed:** merchant "Unknown receipt", amount "—" in `textTertiary`, Orange warning-icon tag "Not processed". Tappable; opens the receipt options sheet (it has no details screen).
- Pressed receipt rows retain their normal surface fill with no highlight. Holds use the scale feedback below; cards clip their rows to the card's corners.
- Press and hold (Processed and Not processed rows; Processing rows ignore it): once it's clear the press is a hold (after about 150ms), ease to scale 0.98. Keep the normal surface fill throughout; no pressed highlight. When the long-press fires (the system long-press timeout, about 400–500ms): `HapticFeedbackType.LongPress`, the row springs back to scale 1, and the receipt options sheet opens. Releasing before the timeout is a normal tap. Implement with `Modifier.combinedClickable(onClick, onLongClick, onLongClickLabel = "Receipt options")` so TalkBack offers the action.
- Each row has merged semantics, for example "Cedar Hardware, US$23.21, Thursday September 24" or "Unknown receipt, not processed, today 8:14 AM".

## ReceiptCard (section)

- Section label above: `section` style, `textTertiary`, inset 4dp inside the screen margin (20dp from the edge), 8dp below.
- Card: `surface`, shape `card` 20, 4dp vertical padding. Edge treatment per theme (see Elevation in `tokens.md`). Rows separated by `divider` lines starting at 68dp.

## Category tags

Categories belong to receipt items. Each `Receipt` from the server has `categories` (each distinct item category once, in order of first appearance) and `items`, each with `amount` and a required `category` of `{ id, name, icon, color }`. Use those keys; do not guess categories from names.

- **Icon:** map the server `icon` key to the bundled drawable `ic_tag_<key>`: `groceries`, `meals`, `shopping`, `home`, `personal_care`, `health`, `transport`, `entertainment` and `other`. Unknown keys use `ic_tag_other`.
- **Colour:** map the server `color` key (`green`, `orange`, `purple`, `brown`, `pink`, `red`, `blue`, `yellow`, `grey`) to the matching `TagColor`. Unknown keys use Grey.
- **Ranking:** sum item amounts per category id using exact decimal arithmetic (`BigDecimal`), including negative adjustments. The top category has the largest sum; break ties by order in `categories`. The current API requires item amounts; if a partial view cannot determine totals, retain `categories` order. Do not show categories for Processing or Not processed rows.

**List row and sheet header** (`ReceiptSummary`): beneath the right-aligned amount, show the top category as a labelled `Tag`. If the receipt has N > 1 categories, follow it 4dp later with `TagCount(count = N - 1)`. The pair keeps the existing 160dp maximum and right alignment in standard rows; stacked layouts use the available width. Reserve room for the count and let the category label wrap. With no categories, omit both tags. The row’s merged description names every category in rank order, for example “Costco Wholesale, $124.24, Sunday October 18, Groceries and Household”.

**`TagCount`:** a label-only neutral chip, “+N”. Grey `TagColor` container and content, `GohoShapes.tag` 4dp corners, minimum height 24dp, 6dp horizontal / 4dp vertical padding, `label` 12/16sp Medium, proportional figures, centred visible glyph bounds. Not tappable and hidden from accessibility, because the row description already lists the categories.

**`CategoryIcon`:** the category wrapper around the shared icon-only `Tag`, for receipt-details item rows and `CategoryBreakdown` rows. 24×24dp, `GohoShapes.tag` 4dp corners, category `TagColor` container, 14dp icon in its content colour, centred. The size stays fixed at larger font scales. Its content description is the category display name. The item row combines name, category and formatted amount into one localized accessibility announcement, such as “Organic Spinach, Groceries, $4.99”, without duplicate child announcements. Not tappable. Loading uses the same icon tag under the shared block skeleton mask, with placeholder semantics cleared.

**`CategoryBreakdown`:** the Categories card on receipt details, shown whenever the receipt has items. Card treatment like ItemsCard (`surface`, shape `card` 20, theme edge treatment, 4dp vertical padding). One row per category in ranking order; rows have 12dp vertical / 16dp horizontal padding and no dividers.

- Row: `CategoryIcon` (24dp, identical to the item rows), 12dp gap, then a column: name (`listRow` 15/20 weight 500, `textPrimary`) and amount (same style, proportional figures, symbol without code) on one baseline with a 16dp minimum gap; 8dp below, a 3dp share bar with fully rounded ends. Track `divider`; fill the category `TagColor` content colour. For non-negative category sums and a positive item total, width = category sum ÷ sum of all item amounts, excluding receipt-level tax. Use the exact decimal sums from the ranking rule.
- The API requires valid decimal item amounts. Preserve their precision while summing by category ID; round only for display. The card reuses the shared delayed skeleton scope while the receipt loads, with two null rows in the same layout and no placeholder announcements.
- Single category: one row with a full bar when its known total is positive. Keep the card; it names the category for the item icons.
- Accessibility: each row is one merged, non-interactive node, “Groceries, $69.41, 59 percent”. The icon and bar are decorative.
- Static: no bar animation for now. Larger text wraps the name above the amount; the bar stays full width beneath.

Refund and zero-total behaviour: if any category sum is negative or the item total is zero/negative, omit all share bars and percentage announcements in the card. Keep every category and its exact signed amount, sorted by spend. Negative line-item adjustments within a category still contribute to its net amount; shares remain valid when every resulting category sum is non-negative and the item total is positive.

**Details items:** keep receipt order. Each item row becomes `CategoryIcon`, 12dp gap, name, 16dp gap, amount. Keep the name on one line, including at larger font sizes, and ellipsize overflow; its accessibility description retains the full name. Vertically center the category tag, item name and amount within the row at every font size; do not offset the icon from the top. The Total row keeps its existing layout without an icon. Do not group items by category.

## DetailList

- Card like above with 16dp horizontal padding. Rows 47 tall: label (`listRow`, `textSecondary`) left, value (`listRow` weight 500, `textPrimary`, proportional figures) right, dividers between rows. Read-only.
- A value that wasn't read shows "—" in `textTertiary`. Allow rows to grow for wrapped values; stack labels above values on narrow screens or with larger text.

## ItemsCard

The receipt's line items, given the same card treatment as Details so they read as primary content.

- Card like ReceiptCard: `surface`, shape `card` 20, theme edge treatment, 16dp horizontal padding, 2dp top padding.
- Item row: padding 14 top and bottom. Leading 24dp `CategoryIcon`, 12dp gap, then name, 16dp gap, then amount. Name (`listRow` at weight 400, `textPrimary`, one line with ellipsis at every font size). Vertically center the tag, name and amount. Line total on the right (`listValue`, `textPrimary`, proportional figures, no wrapping, currency symbol without a trailing code, always two decimals). Hairline `divider` between item rows, spanning the card's inner width.
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

## PhotoControlButton

- The close button in the photo viewer.
- Delegates to `IconButton` with variant 2/Grey under the dark Goho theme in both app themes, because it sits on the dark photo well. Uses the shared 44dp circle, charcoal face, grey rim, shadow and 20dp close icon.
- Preserve visual fade, close semantics and the Goho press; no separate photo-button surface.

## Icons

Material Symbols **Rounded** (`material-icons-extended` `Icons.Rounded.*`) at weight around 500 so strokes match Geist: back `AutoMirrored.Rounded.ArrowBack`, close `Close`, overflow `MoreHoriz`, delete `Delete` (outlined trash), scan `DocumentScanner` (or a custom four-corner viewfinder with a center line, which is what the mockup shows).

## PullToRefresh

Keep the loading arc rotating continuously through the 200ms minimum and the entire bounce-to-zero exit. Stop only when it is invisible or changes to the warning triangle; honour Remove animations.

Use the production `ui/components/PullToRefresh.kt` and the matching `assets/compose/PullToRefresh.kt` reference. The container uses Material 3's `pullToRefresh` nested-scroll modifier for gesture arbitration and draws a Goho indicator. Wrap existing scrollable content; do not introduce a second list layout. Keep the fixed header and floating Add button outside the container. `refreshing` identifies user-initiated work independently of the ordinary loading flag; `failed` supplies its outcome. The component completes its pull ring and gives one threshold haptic, pins a spinning arc during work for a minimum of 200ms, and morphs into an orange warning triangle for three seconds on failure. Bounce into view from zero through 108% to 100%. On completion, bounce to 108% then shrink to zero with a fade in place; keep the content gap open until invisible. It reserves space above the content and leaves the header and footer anchored. Background failures do not activate this indicator; disable new pulls while a request is pending. Supply a Refresh receipts accessibility action for users who cannot perform the gesture.

## Receipt pager and persistent Add button

The native pager and `ReceiptOverview.kt` snapshot now use the persistent Add button and menu. The same bottom safe-area position is retained during cold starts, loading, empty and error states; the scrim covers the window while content and controls respect system bars and display cutouts.

Use the HorizontalPager in production `ui/main/ReceiptOverview.kt`, mirrored in `assets/compose/ReceiptOverview.kt`. Each page uses the same ReceiptListPage composable with its own retained rows and vertical scroll state; receipt data and thumbnails remain shared. Keep both pages composed. ReceiptListHeader selects the pager’s current page and animates tab selections. PullToRefresh wraps the pager, while a single AddButton (with its AddMenu) is a sibling of the screen content, outside the pager and error-recovery transitions. Keep the screen inset by system bars and display cutouts only: the receipt list has no text input, so it must not reserve IME space left by the launcher during cold start. The Add button stays at the same bottom position before skeletons appear, during loading and after results arrive, and across section switches. Do not create per-page or per-section Add buttons or reset a page’s scroll position when changing tabs.

## SectionTitle and SectionMenu

Native menu implementation; behaviour in `screens.md` section 7. `assets/compose/SectionTitle.kt`, `SectionMenu.kt` and `ReceiptListHeader.kt` mirror the app. `SectionNavigation.kt` is only a future title-swipe/switching sketch and must not replace the native menu code.

- `SectionTitle(title, open, onClick, modifier)`: title heading/Button with the 18dp chevron, expanded/collapsed semantics and shared press feedback. It only toggles the menu; it has no swipe or next/previous actions.
- `SectionMenuEntry(label, icon, selected, count, onClick)`: resource-backed label/icon, selected state, nullable formatted count and callback. The screen supplies Receipts (selected, loaded All count) then Books (unknown count omitted). Both callbacks are intentionally empty in this step; choosing a row dismisses first.
- `SectionMenu(open, entries, onDismiss, onClosed)`: modal `Popup` anchored 4dp below the title row at the screen margin. It owns selected-row focus, Back/outside dismissal, selected-button semantics (including a click action on the current section), the shared press treatment and a scrollable body bounded by the window. Width grows with font scale from 240dp to the available width. It retains the popup for its 120ms exit, disables outgoing actions immediately and calls `onClosed` after removal to restore title focus.
- `SectionMenuScrim(open, onDismiss)`: full-window overlay at 0.35 × the existing scrim alpha, drawn above screen content and Add. Its 160ms enter/120ms exit matches the popup; the popup also scales from 0.96 around the top/start anchor. Remove animations snaps the menu, scrim and chevron.
- `ReceiptOverview` coordinates the two menus, hides underlying semantics, disables pager/pull-to-refresh while either menu is open, and leaves receipt filters and scroll positions intact. `ReceiptListHeader` owns the anchor and restores title focus.
- Use `sectionMenu` shape, `sheet` fill, sheet ring/shadow and selected `accentContainer` colours. No Material dropdown styling or ripples. A full section registry, persistence, title roll/swipe and Books navigation wait for actual section switching.

## AddButton and AddMenu

Native implementation of the October 22 design. `assets/compose/AddButton.kt` and `AddMenu.kt` mirror the app; `ReceiptOverview.kt` shows the integration.

- `AddButton(open, onClick, modifier, enabled)`: one persistent 60dp circle using `IconButton` with variant 1 / Purple and its shared press/surface treatment. The 22dp plus rotates 45° when open; its description changes from “Add” to “Close add menu”. It passes `pressed = open` to `IconButton`, holding the shared 97% scale, 1dp lowering, pressed fill and faded shadow until dismissal. `IconButton` exposes an optional `pressed: Boolean = false` for this persistent visual state; its touch target stays unchanged.
- `AddMenu(open, actions, onDismiss, modifier)`: a full-window scrim with a right-aligned stack of `AddMenuAction(label, icon, onClick)` entries. Labels and drawable icons use resource IDs. Each action uses the sheet fill/ring/shadow, a 20dp icon, wrapping `rowTitle` text and a minimum 52dp height. Actions are supplied top to bottom; no section registry is needed until section navigation is implemented.
- The receipt screen supplies Scan book, then Scan receipt. Scan receipt dismisses the menu and calls the existing scanner. **Scan book intentionally only dismisses the menu**, at the user’s request; no upload, navigation or scanner invocation is wired yet.
- Back, the scrim and the close button dismiss. Focus enters the first action and returns to Add. Underlying receipt semantics are hidden while open; paging and pull-to-refresh are disabled. Outgoing actions lose their semantics and clicks immediately.
- Actions rise 8dp, fade and spring from 0.92 scale (damping 0.6, stiffness 450), staggered 45ms from the button upwards. Closing fades and shrinks each action over 140ms, staggered 45ms from top to bottom. The screen overlay fades linearly over 240ms in / 180ms out, with opacity read during drawing so the fade does not recompose the action stack. The icon keeps 180ms in / 140ms out. Opening Add gives a ContextClick haptic; each action starts with a lighter SegmentTick at 45ms and 90ms after opening. Closing cancels pending entry ticks; restoring an already-open menu does not replay them. The button stays mounted. Remove animations skips entry ticks and snaps the menu and icon with no rise or rotation. Extra shadow drawing space preserves the 16dp gap above Add without a clipped shadow edge.
- Insets use system bars and display cutouts, never the outgoing keyboard. The button remains 24dp from the end and 28dp above the bottom safe area. Labels can wrap at large text sizes, and the menu can scroll on short screens.
- Icons are the native outline vectors in `assets/icons/navigation/`. The native theme exposes `sheetRing` (white 5% dark / `#26233A` 4% light); other dimensions and durations are in the matching `Spacing.kt` and `Motion.kt` snapshots.
