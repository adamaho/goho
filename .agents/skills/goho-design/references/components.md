# Goho components

Name UI components by their role, never with a `Goho` prefix: `Tag`, `ActionButton`, `IconButton`, `SectionTitle`, `SectionMenu`, `SectionScreen`, `AddButton`, `AddMenu`, `FilterPager`, `ListFilter`, `ListCard`, `StatusContent`, `SearchField`, `OptionsSheet`, `DeletionFeedback`, `SkeletonScope` and `PullToRefresh`. Components shared by Receipts and Books are named for their list role rather than for receipts. Use the same convention for component-specific types (`TagColor`, `ButtonColor`) and matching filenames. Keep call sites, examples and Compose references aligned.

Deletion keeps the approved confirmation and accepts the request immediately, with optimistic list removal and app-level failure feedback. The October 26 behavior in `screens.md` section 5 supersedes older server-wait and inline network-error references. There is no Undo or new fetching library.

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
ActionButton(
    "Delete book",
    onDeleteClick,
    variant = 2,
    color = ButtonColor.Grey,
    contentColor = GohoTheme.colors.onDangerContainer,
    icon = { TrashIcon(Modifier.size(GohoSpacing.buttonIcon)) },
)
ActionButton("Clear search", onClear, variant = 2, color = ButtonColor.Grey, size = ButtonSize.Small)
```

- Variant 1: glossy face, bright upper rim, inset reflection, soft wide shadow; weight 600 label.
- Variant 2: frosted finish in light mode, almost flat face with a dim grey outer rim meeting the face directly in dark mode; quieter shadows and weight 500 label. The base colour is still selected independently.
- Purple uses `buttonPrimary` / `buttonPrimaryPressed` and white `onButtonPrimary`; red uses `danger` / `dangerPressed` and white `onDanger`; grey uses `buttonSecondary` / `buttonSecondaryPressed` with `textPrimary`. Red remains reserved for destructive actions in product flows.
- Full width inside the screen margin, at least 52dp tall, shape `button` 20 (not a pill), horizontal padding 20.
- `size = ButtonSize.Small` (approved October 25, 2026) is the compact action for secondary, in-content actions such as Clear search: it hugs its label instead of filling the width, at least 44dp tall, shape `buttonSmall` 16, horizontal padding 18, and `buttonSmall` / `buttonSecondarySmall` labels (15/20sp). Finish, colour, icon slot, loading and reserved labels work as on the regular size. Centre it in its parent; large text grows its height and wraps the label. Keep regular, full-width buttons for primary flow actions (Upload, Delete, Try again).
- Optional decorative icon slot: the button supplies `LocalContentColor` from the chosen palette. Material icons, `UploadIcon` and `TrashIcon` inherit it; custom drawing should read it too. Use 18dp icons and an 8dp gap.
- Optional `contentColor` overrides the palette's label and icon colour without changing the finish. Its only use is the book overlay's initial Delete book: variant 2/Grey with `onDangerContainer`, matching the receipt menu's Delete receipt row.
- The shared `ButtonColor.kt` palette resolver owns fill, pressed fill, content tint, shadow colour and glossy lower shade. Purple uses a violet lower shade for both the face and inner edge. `ButtonSurface.kt` applies the numbered finish; screens do not implement their own styling.
- Existing primary actions map to 1 / Purple, secondary actions to 2 / Grey, and destructive confirmation to 1 / Red. Stack actions with a 10dp gap.
- Disabled: whole button at 40% alpha, no press, not clickable.
- Loading: replace the label with an 18dp loading icon in the chosen colour palette's content colour. The receipts retry action does this after the shared 200ms delay. Keep both labels measured so the button bounds remain stable, expose “Trying again…” and indeterminate progress, and keep the icon itself decorative. Callers disable immediately while work is pending.

## Status content (empty and error states)

- Full width inside the screen margin, padding 28 top / 24 sides / 32 bottom (24 bottom when it has a button). Content centered directly on the screen background. No enclosing card fill, border or rounded clipping in any list status state.
- Use the shared `StatusContent` for no receipts, no books, needs attention and load error. `LoadErrorState` takes the section's description (“We couldn’t load your receipts…” or “…your books…”); `NoNeedsAttentionState` is shared as is. Preserve the shared padding, spacing, entrance and centered placement; the Add button stays separate when present.
- No receipts, no books, empty Needs attention and load error each show an illustration (220×190dp), followed by a 4dp gap before the title. No books uses the approved [book-holding Bram](../assets/illustrations/status-no-books.png) with “No books yet” and “Saved books will appear here.”; it adds no scan instruction. Title is 20/26 SemiBold −0.02em `textPrimary`, followed by a 6dp gap before body text in `body` `textSecondary` (max width 290dp), then an optional full-width button 22dp below.
- Illustration assets live in `assets/illustrations/`. No receipts uses `status-no-receipts.png`; no books uses `status-no-books.png`; empty Needs attention uses the calm thumbs-up `status-needs-attention.png`; load error uses the gentle shrug `status-load-error.png`. Book search with no matches uses the magnifying-glass `status-no-search-results.png`. All five PNGs are 1350×1165 RGBA, with each state using the same transparent asset in both themes. Preserve the artwork unchanged and render with `ContentScale.Fit` in the existing slot up to 220dp wide with a 220:190 aspect ratio. These five poses are the only production Bram artwork. The neutral stance and former header mark are design identity references only; other dedicated artwork is deferred until its feature is implemented. The older SVGs in `legacy/` are not sources for these Bram images.
- Book search with no matches: the [magnifying-glass Bram](../assets/illustrations/status-no-search-results.png), distinct from “No books yet”, in the same illustration slot, title gap and theme treatment, with a small variant 2/Grey `ActionButton` “Clear search” 22dp below the text instead of the full-width button. It starts at the top of the content rather than centring, so it clears the keyboard, and enters once when results first become empty. See [screens.md section 10](screens.md#10-book-search).
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
- Drag down, tap the scrim or use Back to dismiss before confirming. Once deletion is accepted, block duplicate input only for handoff and the sheet’s exit; the network request continues outside the sheet.
- Keep the receipt header mounted across states. Confirmation has no title, large icon or description; buttons appear together directly below the shared header without stagger or bounce.
- Content changes inside the same sheet animate their height (`animateContentSize`, about 280ms) instead of opening a second sheet. The shared `OptionsSheet` for receipt and book options, its header and states are specified in `screens.md` section 5.
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

## SearchField

- `SearchField(state, placeholder, clearLabel, onClear, focusRequester, modifier)`: a single-line `BasicTextField` over a `TextFieldState`, used by book search ([screens.md section 10](screens.md#10-book-search)).
- At least 44dp tall (grows with large text), shape `pill`, fill `surface`, a 1dp `outline` ring at rest and a 2dp `accent` ring while focused. 14dp start padding, an 18dp `SearchIcon` in `textTertiary`, a 10dp gap, then the query in `input` (16/22sp Regular) `textPrimary` with the placeholder in `textTertiary` and an `accent` cursor.
- Once there is a query, a 28dp `surfaceMuted` clear face with a 14dp X in `textSecondary` sits centred in a 44dp touch target at the end, 8dp from the edge, with the Goho press and the clear label as its description. `onClear` empties the query; book search also refocuses the field and explicitly shows the keyboard, since the field can stay focused after Back hides it.
- The IME action is Search, which clears focus: the keyboard hides and the ring returns to rest, keeping the query.
- `SearchIcon(size, color)` draws the 2dp-stroke magnifying glass for the 20dp search button glyph and the 18dp field glyph. Reference: `assets/compose/SearchField.kt`.

## ListFilter

Shared by Receipts and Books through `FilterPager` (below); copy is section-neutral.

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

Canonical references: `assets/compose/Tag.kt`, `TagColor.kt`, `UploadTags.kt` and `CenteredPillLabel.kt` mirror the existing native tag and upload-state implementation. The older combined `Components.kt` delegates receipt tags to those components. The shared `Tag` also has an icon-only overload with required `icon`, `color` and `contentDescription`, plus optional `modifier`. Both forms use the same surface, palette and corners. `CategoryIcon.kt` maps server metadata into that overload, and `ReceiptItemsCard.kt` shows the native details layout. `CategoryBreakdown.kt` and `ReceiptCategorySummary.kt` mirror the native Categories card and exact-decimal aggregation. List/sheet category ranking and `TagCount` remain approved specifications below, not implemented snapshots.

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
- `ReceiptUploadTag` uses Purple + scan-line for “Reading receipt…” and Orange + triangle-alert for “Not processed”. `BookUploadTag` is identical with “Reading cover…”. Keep the existing reduced-motion-aware text shimmer while processing; its highlight blends 4% toward the container so every palette remains readable. Icons remain still. The failed-upload sheet uses the same tag. Scan preview's uploading/submitted copy for its `ScanKind` and shared failure copy use `Tag` with the corresponding scan or warning icon; Ready has no tag.
- Skeleton loading masks the same tag element, clearing placeholder semantics. The tag still has an icon parameter while loading; no separate skeleton layout.
- Nine theme-aware colour pairs live in `TagColor`, separate from the three action-button colours. See `tokens.md`. Icon masters, Android resource mapping and licence are in `assets/icons/tags/README.md`.

## ReceiptRow

`ReceiptSummary` owns the shared content, date formatting, amount and tags for list rows and the bottom-sheet header. The list wrapper owns tap/hold feedback and card padding; the sheet keeps the same content display-only and mounted above its changing actions. Canonical references: `assets/compose/ReceiptSummary.kt`, `ReceiptOptions.kt` and `OptionsSheet.kt`. `OptionsSheet` takes the item's header and copy (pane title, delete, pending, failure and cancel labels). Its `onDelete: suspend () -> Boolean` returns whether the operation was accepted, not whether the server finished. It owns the menu, confirmation, brief handoff/exit lock and fallback for rejected handoff; `ReceiptOptions` and `BookOptions` supply the item-specific content. Accepted deletion closes the sheet and triggers `onDeleted`; requests and later network failures belong to the activity.

Row inside a card: `thumbnail | column(line 1, line 2)`.

- Line 1: merchant (`rowTitle`, `textPrimary`, single line, ellipsis) … trailing amount (`rowTitle`, proportional figures).
- Line 2 (5dp below): date (`meta`, `textTertiary`) … right-aligned tags beneath the price: the upload-state tag, or for processed receipts the top-spend category `Tag` and optional `TagCount` (see Category tags).
- States:
  - **Processed:** amount in `textPrimary`. The symbol and number use `textPrimary`; the trailing currency code is smaller (12sp) in `textTertiary`. Top-spend category `Tag`, plus `TagCount` when there are more categories. Tappable; opens details.
  - **Processing:** merchant "New receipt", date "Just now", trailing amount replaced by a 52×12 fully round shimmering skeleton, Purple scan-icon tag "Reading receipt…". Not tappable.
  - **Not processed:** merchant "Unknown receipt", amount "—" in `textTertiary`, Orange warning-icon tag "Not processed". Tappable; opens the receipt options sheet (it has no details screen).
- Pressed Processed and Not processed rows show the same feedback as saved Books rows, from the shared `Modifier.listRowPressFeedback` (see ListCard below): the `surfacePressed` fill inset 6dp (`rowPressInset`) with the 14dp `heldRow` shape, no ripple. It is drawn only; row layout, padding and the tap area are unchanged. Cards clip their rows to the card's corners.
- Press and hold (Processed and Not processed rows; Processing rows ignore it): once it's clear the press is a hold (after about 150ms), ease to scale 0.98 while the pressed fill stays. When the long-press fires (the system long-press timeout, about 400–500ms): `HapticFeedbackType.LongPress`, the row springs back to scale 1, and the receipt options sheet opens. Releasing before the timeout is a normal tap. Implement with `Modifier.combinedClickable(onClick, onLongClick, onLongClickLabel = "Receipt options")` so TalkBack offers the action; Not processed rows without a saved receipt use “Scan options”, as failed book scans do.
- Each row has merged semantics, for example "Cedar Hardware, US$23.21, Thursday September 24" or "Unknown receipt, not processed, today 8:14 AM".

## DeletionFeedback

`DeletionFeedback(deletions, modifier)` is a single app-root snackbar host shared by receipt and book deletion. It consumes failures from activity-owned `PendingDeletions`, after any server reconciliation, so it survives the originating sheet, overlay or details leaving. Wait for the app window to regain focus before presenting a message. If another sheet, scanner or app takes focus, retain the message and remove the host temporarily so it cannot expire unseen; show it again when focus returns. Use the shared `surface`, `textPrimary`, `card` shape and `body` type, with a small variant 2/Grey `ActionButton` labelled “Dismiss”. Set the snackbar’s `actionLabel` to the same resource so accessibility-aware timeout handling knows an action is available. There is no Undo or automatic retry. The host has `screenMargin` horizontal padding. On section roots its bottom clearance is `fabBottom + addButton + contentGap`, above Add; other destinations use `screenMargin`. Respect navigation-bar and keyboard insets. Copy and reconciliation behavior are in `screens.md` section 5. The native mirror is `assets/compose/DeletionFeedback.kt`; the coordinator is app state rather than a UI component.

## ListCard (section) and ListDivider

Shared by receipt lists, receipt details cards and the Books list.

- Section label above: `section` style, `textTertiary`, inset 4dp inside the screen margin (20dp from the edge), 8dp below.
- Card: `surface`, shape `card` 20, 4dp vertical padding. Edge treatment per theme (see Elevation in `tokens.md`). Rows separated by `divider` lines starting at 68dp; `ListDivider(start)` defaults to that, and Books passes `bookDividerStart` (76dp) to match its wider covers.
- `Modifier.listRowPressFeedback(interaction, held)` is the shared tap/hold feedback for tappable receipt and saved book rows. Pair it with `combinedClickable(interactionSource = interaction, indication = null, …)` and apply it after the clickable and before the row padding. It draws the inset `surfacePressed` fill (none under Remove animations, like other Goho presses) and eases to `HOLD_SCALE` while `held`, snapping when animations are disabled. Each row keeps its own actions, the 150ms hold timer and the reset when the long press fires.

## Category tags

Categories belong to receipt items. Each `Receipt` from the server has `categories` (each distinct item category once, in order of first appearance) and `items`, each with `amount` and a required `category` of `{ id, name, icon, color }`. Use those keys; do not guess categories from names.

- **Icon:** map the server `icon` key (`Category.iconRes`) to the bundled drawable `ic_tag_<key>`: `groceries`, `meals`, `shopping`, `home`, `personal_care`, `health`, `transport`, `entertainment` and `other`. Unknown keys use `ic_tag_other`.
- **Colour:** map the server `color` key (`green`, `orange`, `purple`, `brown`, `pink`, `red`, `blue`, `yellow`, `grey`) to the matching `TagColor`. Unknown keys use Grey.
- **Ranking:** sum item amounts per category id using exact decimal arithmetic (`BigDecimal`), including negative adjustments. The top category has the largest sum; break ties by order in `categories`. The current API requires item amounts; if a partial view cannot determine totals, retain `categories` order. Do not show categories for Processing or Not processed rows.

**List row and sheet header** (`ReceiptSummary`): beneath the right-aligned amount, show the top category as a labelled `Tag`. If the receipt has N > 1 categories, follow it 4dp later with `TagCount(count = N - 1)`. The pair keeps the existing 160dp maximum and right alignment in standard rows; stacked layouts use the available width. Reserve room for the count and let the category label wrap. With no categories, omit both tags. The row’s merged description names every category in rank order, for example “Costco Wholesale, $124.24, Sunday October 18, Groceries and Household”.

**`TagCount`:** a label-only neutral chip, “+N”. Grey `TagColor` container and content, `GohoShapes.tag` 4dp corners, minimum height 24dp, 6dp horizontal / 4dp vertical padding, `label` 12/16sp Medium, proportional figures, centred visible glyph bounds. Not tappable and hidden from accessibility, because the row description already lists the categories.

**`CategoryTag`:** the labelled `Tag` for a category, using the same icon and colour mapping and the trimmed, capitalised display name. Book rows use it today; receipt list ranking above remains an approved design.

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

- Card like ListCard: `surface`, shape `card` 20, theme edge treatment, 16dp horizontal padding, 2dp top padding.
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

- The close button in the shared `PhotoViewer` (receipt photos and book covers). Its X is the shared `CloseIcon`, also used by the book overlay’s Close.
- Delegates to `IconButton` with variant 2/Grey under the dark Goho theme in both app themes, because it sits on the dark photo well. Uses the shared 44dp circle, charcoal face, grey rim, shadow and 20dp close icon.
- Preserve visual fade, close semantics and the Goho press; no separate photo-button surface.

## Icons

Material Symbols **Rounded** (`material-icons-extended` `Icons.Rounded.*`) at weight around 500 so strokes match Geist: back `AutoMirrored.Rounded.ArrowBack`, close `Close`, overflow `MoreHoriz`, delete `Delete` (outlined trash), scan `DocumentScanner` (or a custom four-corner viewfinder with a center line, which is what the mockup shows).

Natively, delete actions share the drawn `TrashIcon` (`ui/components/TrashIcon.kt`, mirrored) with the 2dp `iconStroke`: 22dp in the receipt menu's Delete receipt row and 18dp in the book overlay's Delete book button. It defaults to the current `LocalContentColor`; the receipt row passes `onDangerContainer`.

## PullToRefresh

Keep the loading arc rotating continuously through the 200ms minimum and the entire bounce-to-zero exit. Stop only when it is invisible or changes to the warning triangle; honour Remove animations.

Use the production `ui/components/PullToRefresh.kt` and the matching `assets/compose/PullToRefresh.kt` reference. Each section supplies its `refreshLabel` and `progressLabel` (“Refresh receipts” / “Refreshing receipts…”, “Refresh books” / “Refreshing books…”); the pull, release and failure cues are shared. The container uses Material 3's `pullToRefresh` nested-scroll modifier for gesture arbitration and draws a Goho indicator. Wrap existing scrollable content; do not introduce a second list layout. Keep the fixed header and floating Add button outside the container. `refreshing` identifies user-initiated work independently of the ordinary loading flag; `failed` supplies its outcome. The component completes its pull ring and gives one threshold haptic, pins a spinning arc during work for a minimum of 200ms, and morphs into an orange warning triangle for three seconds on failure. Bounce into view from zero through 108% to 100%. On completion, bounce to 108% then shrink to zero with a fade in place; keep the content gap open until invisible. It reserves space above the content and leaves the header and footer anchored. Background failures do not activate this indicator; disable new pulls while a request is pending. Supply the section's refresh accessibility action for users who cannot perform the gesture.

## SectionScreen, FilterPager and persistent Add button

The same bottom safe-area position is retained during cold starts, loading, empty and error states and across section switches; the scrim covers the window while content and controls respect system bars and display cutouts.

- `SectionScreen(section, onSectionChange, receiptCount, bookCount, isOpeningScanner, onScanBook, onScanReceipt, modifier, addAlpha, content)` in production `ui/main/SectionScreen.kt` (mirrored in `assets/compose/`) is the section root. It owns the background, safe-area insets, `SectionTitle` and `SectionMenu`, both menu-open flags, one `AddMenu` and `AddButton`, and `SectionMenuScrim`. `Section` is an ordered enum (Receipts, then Books) with each title and icon. The content slot receives `menuOpen` so the section can pause paging and pull-to-refresh; the shell hides its semantics and blocks focus while either menu is open.
- `addAlpha: () -> Float = { 1f }` lets a modal overlay that owns the screen fade Add without unmounting it. The shell knows nothing about the overlay: `BookOverlayHost` passes the value from its presentation transition through its content slot, and the activity hands it on. Add fades as one offscreen layer with `LayerOutsets(addMenuShadowPadding)`, so its shadow isn’t clipped or seen through the face. At 0, Add is also disabled, unfocusable and hidden from accessibility. Its own menus never hide it.
- The shell wraps the current section in a `SaveableStateHolder` keyed by section, so each section keeps its filter page and both page scroll positions while the other is shown. Only the visible section is composed; anything that must outlive a switch, such as the thumbnail caches of loaded images, is held by the activity.
- `FilterPager` in `ui/main/FilterPager.kt` (mirrored) is the shared All / Needs attention presentation: `ListFilter` tabs, `PullToRefresh` and a two-page `HorizontalPager` with the recovery crossfade and inactive-page semantics. `rememberFilterPagerState()` saves the page and tracks which page already gave its settle haptic; `select(page, animate)` moves without a second haptic, as used by the upload reveal. Each section supplies counts, enabling rules, refresh copy and its own page content; there is no universal list.
- `ReceiptOverview` and `BookOverview` are the section bodies. Receipts keeps its date sections, row taps and holds, options sheet and upload reveal. Books keeps saved-row taps for the book overlay, and saved-row holds and Not processed scan taps or holds for `BookOptions`: `BookOverview(…, onBookClick, deleteEntry, …)` holds a snapshot of the held `BookListEntry`, keyed by its row key, until the sheet closes, and the activity passes `BookListController.delete`, which deletes a book or a failed scan, as `deleteEntry`. `BookOverview(…, uploadToReveal, onUploadRevealed)` reveals an accepted cover upload the same way, treating a succeeded scan as revealed once its saved or matched book is listed. Keep the screen inset by system bars and display cutouts only: sections have no text input, so they must not reserve IME space left by the launcher during cold start. Do not create per-page or per-section Add buttons or reset a page’s scroll position when changing tabs or sections.

## SectionTitle and SectionMenu

Native menu implementation; behaviour in `screens.md` section 7. `assets/compose/SectionTitle.kt`, `SectionMenu.kt` and `SectionScreen.kt` mirror the app. `SectionNavigation.kt` is only a future title-swipe sketch and must not replace the native menu code.

- `SectionTitle(title, open, onClick, modifier)`: title heading/Button with the 18dp chevron, expanded/collapsed semantics and shared press feedback. It only toggles the menu; it has no swipe or next/previous actions.
- `SectionMenuEntry(label, icon, selected, count, onClick)`: resource-backed label/icon, selected state, nullable formatted count and callback. `SectionScreen` supplies one entry per `Section`: Receipts with its loaded All count, then Books with its loaded saved-book count. Unknown counts are omitted. Choosing a row begins dismissal and queues a switch unless it is already current; `SectionScreen` applies the pending section in `onClosed`, after the popup is removed.
- `SectionMenu(open, entries, onDismiss, onClosed)`: modal `Popup` anchored 4dp below the title row at the screen margin. It owns selected-row focus, Back/outside dismissal, selected-button semantics (including a click action on the current section), the shared press treatment and a scrollable body bounded by the window. Width grows with font scale from 240dp to the available width. It retains the popup for its 120ms exit, disables outgoing actions immediately and calls `onClosed` after removal to apply the queued section and restore title focus. Its surface, rows and shadow fade as one offscreen graphics layer with `LayerOutsets(sectionMenuShadowPadding)`; the extra drawing bounds preserve the shadow without changing the anchor or hit area.
- `SectionMenuScrim(open, onDismiss)`: full-window overlay at 0.35 × the existing scrim alpha, drawn above screen content and Add. Its 160ms enter/120ms exit matches the popup; the popup also scales from 0.96 around the top/start anchor. Remove animations snaps the menu, scrim and chevron.
- `SectionScreen` coordinates the two menus, hides underlying semantics, and lets the section disable paging and pull-to-refresh while either menu is open, leaving filters and scroll positions intact. It owns the title anchor and restores title focus.
- Use `sectionMenu` shape, `sheet` fill, sheet ring/shadow and selected `accentContainer` colours. No Material dropdown styling or ripples. Title roll/swipe waits for its own implementation.

## AddButton and AddMenu

Native implementation of the October 22 design. `assets/compose/AddButton.kt` and `AddMenu.kt` mirror the app; `SectionScreen.kt` shows the integration.

- `AddButton(open, onClick, modifier, enabled)`: one persistent 60dp circle using `IconButton` with variant 1 / Purple and its shared press/surface treatment. The 22dp plus rotates 45° when open; its description changes from “Add” to “Close add menu”. It passes `pressed = open` to `IconButton`, holding the shared 97% scale, 1dp lowering, pressed fill and faded shadow until dismissal. `IconButton` exposes an optional `pressed: Boolean = false` for this persistent visual state; its touch target stays unchanged.
- `AddMenu(open, actions, onDismiss, modifier)`: a full-window scrim with a right-aligned stack of `AddMenuAction(label, icon, onClick)` entries. Labels and drawable icons use resource IDs. Each action uses the sheet fill/ring, a bounded 16dp blur shadow with a 4dp downward offset and the secondary shadow opacity, a 20dp icon, wrapping `rowTitle` text and a minimum 52dp height. Actions are supplied top to bottom; no section registry is needed until section navigation is implemented.
- `SectionScreen` supplies Scan book, then Scan receipt, on every section. Each dismisses the menu and opens the same scanner with its `ScanKind`; the activity keeps that kind for the result and its upload. A successful receipt upload selects Receipts and reveals the new row at the top of All; a successful cover upload selects Books and reveals the accepted scan at the top of All. See `ScanPreviewScreen.kt` and [screens.md section 4](screens.md#4-scan-preview).
- Back, the scrim and the close button dismiss. Focus enters the first action and returns to Add. Underlying section semantics are hidden while open; paging and pull-to-refresh are disabled. Outgoing actions lose their semantics and clicks immediately.
- Actions rise 8dp, fade and spring from 0.92 scale (damping 0.6, stiffness 450), staggered 45ms from the button upwards. Closing fades and shrinks each action over 140ms, staggered 45ms from top to bottom. The screen overlay fades linearly over 240ms in / 180ms out, with opacity read during drawing so the fade does not recompose the action stack. The icon keeps 180ms in / 140ms out. Opening Add gives a ContextClick haptic; each action starts with a lighter SegmentTick at 45ms and 90ms after opening. Closing cancels pending entry ticks; restoring an already-open menu does not replay them. The button stays mounted. Remove animations skips entry ticks and snaps the menu and icon with no rise or rotation. Each action composites its face and shadow together in an offscreen layer with 32dp outsets. The bounded drop shadow fades out inside the scroll viewport padding, avoiding the hard rectangular edge below the menu produced by position-dependent elevation shadows. Extra drawing space preserves the 16dp gap above Add.
- Insets use system bars and display cutouts, never the outgoing keyboard. The button remains 24dp from the end and 28dp above the bottom safe area. Labels can wrap at large text sizes, and the menu can scroll on short screens.
- Icons are the native outline vectors in `assets/icons/navigation/`. The native theme exposes `sheetRing` (white 5% dark / `#26233A` 4% light); other dimensions and durations are in the matching `Spacing.kt` and `Motion.kt` snapshots.

## BookRow and BookCover

Books rows in `ui/main/BookRow.kt` around the display-only `BookSummary` in `ui/main/BookSummary.kt` (both mirrored, with the generated cover in `ui/components/GeneratedBookCover.kt`), inside one `ListCard` separated by `ListDivider`. `BookListEntry` is either `Saved(book)` or `Scan(uploadId, failed, uploadedAt)`; `bookListEntries` lists queued, processing and failed scans first in server order (newest first), then saved books A–Z by title: a `java.text.Collator` for the app locale at `SECONDARY` strength, so case is ignored but accents still order. The stable sort keeps server order (newest first) for equal titles. `BookOverview` passes its configuration locale and includes it in the `remember` keys. There is no sort control or saved preference. Succeeded scans are represented by their book, which several scans can share. Saved rows key by book ID and scans by upload ID.

- Row: `BookCover` | 12dp (`thumbToText`) | column(title, metadata) | 16dp (`textToTag`) | tag, with the receipt row padding, 72dp minimum height and merged semantics. Saved rows open the book overlay on tap, with the shared receipt and book row pressed fill (`listRowPressFeedback`: `surfacePressed`, no ripple) and a click action. The fill is drawn inset 6dp (`rowPressInset`) from each row edge with the 14dp `heldRow` shape; the card’s additional 4dp vertical padding leaves 10dp above the first highlight and below the last. The card surface stays visible around it; it doesn't change the row's layout or tap area. Press and hold opens `BookOptions`, as receipt rows do: after about 150ms the row eases to scale 0.98 while the pressed fill stays; when the long press fires, `combinedClickable` gives its single LongPress haptic, the row springs back and the sheet opens. TalkBack offers the “Book options” long-click action. Focus returns to the row when the overlay or sheet closes, unless the row is leaving. Not processed scan rows open `BookOptions` with Delete scan on a tap or hold, with the same pressed fill and a “Scan options” long-click action. Queued, processing and skeleton rows have no tap, hold or options.
- `BookSummary` owns the cover, title, metadata and tag for rows and the options-sheet header; `BookRow` owns tap/hold feedback, focus and card padding. Only rows lift their cover into the book overlay; the sheet header draws the same cover without a shared-transition key.
- Removal begins on accepted deletion, before its network response. `BookOverview` keeps removed rows mounted in their previous place, as `ReceiptOverview` does, and folds them out (fade and shrink toward the top, `SHEET_CONTENT_MILLIS`; instant with Remove animations). A folding row has no click or hold action, and a book deleted from the overlay keeps its cover slot empty, so nothing flies back into it. The card folds with the last row before the empty state appears.
- Title: `rowTitle`, one line with ellipsis at every font size; `textPrimary` for saved books, `textSecondary` for “New book” and “Unknown book”.
- Metadata (`meta`, `textTertiary`): author, or “author · reading level” when one is set. A processing scan shows a shimmering 12dp pill in the metadata line. A failed scan shows its upload time like receipt rows (“Today, 8:14 AM”, otherwise “Yesterday” or a short weekday date).
- Tag: `CategoryTag` for saved books from the server's icon and colour keys; `BookUploadTag` for scans. Standard rows cap it at 160dp and anchor it to the bottom end of the row, aligned with the cover’s bottom edge, while the cover and text stay vertically centred; the wider 16dp gap makes the metadata truncate before it. At font scale ≥1.3 or narrow widths the tag moves under the metadata, end-aligned, and metadata may wrap.
- `BookCover`: 48×56dp (`coverWidth` × `coverHeight`) with the thumbnail shape, outline and skeleton mask; book dividers start at 76dp (`bookDividerStart`) to align with the text. Receipt thumbnails keep 40×48dp and the 68dp divider. Covers load through the shared `ThumbnailCache` only when the book `hasImage` and the cover is on screen; saved books without a cover, or whose cover fails to load, show the small generated cover (`GeneratedBookCover` with `BookCoverSize.Small`) and failed loads are requested again when the row next needs them; until the first load finishes, the row shows the neutral book placeholder so a photo doesn't flash the generated cover. The cache keeps only loaded images, so they survive section switches. Generated cover (approved October 22, 2026, the small version of the book details cloth cover in section 9): the same cloth colour and 8dp corners with a 1dp inset ring, a 3dp spine in the cloth mixed 28% toward black, and the title and author as marks in the cover text colour: two 3dp rounded bars 8dp from the start (8dp from the top to 6dp from the end, and 14dp from the top to 12dp from the end), plus a 14×2dp bar 7dp from the bottom at 85%. No readable text at this size; it is decorative and the row announces the book. Scan placeholders are decorative 20dp icons: a lavender scan mark on `accentContainer` while processing, and an orange book on `attentionContainer` with an 8dp attention dot inset 6dp from the bottom end for failures.
- Loading: four null rows inside `SkeletonScope` with one “Loading books…” polite progress description.
