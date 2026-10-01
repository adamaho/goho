# Goho components

Deletion components and row interactions describe the v2 target design. Verify server support and implement them only as part of a requested deletion feature.

Reference implementations live in `assets/compose/GohoComponents.kt`. Every pressable uses the Goho press (`Modifier.gohoPressTransform`) with `indication = null`. Only the components below are needed; don't add others without a design.

## GohoScanFab

- 56 tall, shape `fab` 20, padding 18 left / 22 right.
- Fill: vertical gradient `accentTop` → `accent`. Pressed: `accent` → `accentPressed`.
- Content: scan icon 22dp, 9dp gap, "Scan" in `button` style, color `onAccent`. Content description "Scan receipt".
- Shadow 3dp at rest, 0.5dp pressed; 1dp top highlight white 45% → 25%.
- Placed bottom right over the list without a bottom gradient. Keep enough list padding for the final row to scroll clear of the button.

## GohoPrimaryButton

- Full width inside the screen margin, 52 tall, shape `button` 16 (not a pill), horizontal padding 20.
- Fill: vertical gradient `accentTop` → `accent`; pressed `accent` → `accentPressed`. Shadow and highlight per tokens.
- Content: optional 18dp icon, 8dp gap, label in `button` style, color `onAccent`.
- Disabled: whole button at 40% alpha, no press, not clickable.

## GohoSecondaryButton

- Same geometry. Fill `buttonSecondary`, pressed `buttonSecondaryPressed`. Label `button` style at weight 600 in `textPrimary`, optional 18dp icon.
- Stack under a primary button with a 10dp gap. Don't use text-only link buttons for actions.

## GohoDangerButton

- Same geometry as GohoPrimaryButton (52 tall, shape `button` 16, full width). Fill: vertical gradient `dangerTop` → `danger`; pressed `danger` → `dangerPressed`. Label `button` style in `onDanger`, optional 18dp trash icon.
- Only for the final confirming action of something destructive. Red is never used for anything else.

## GohoSheet (floating bottom sheet)

- Floats inset from the screen: 8dp from the left, right and bottom edges (plus the navigation bar inset), shape `sheet` 28 on all corners, fill `sheet`, shadow per tokens. Scrim `scrim` behind it.
- Grabber: 36×4, fully round, `grabber`, 8dp from the top, centered.
- Drag down or tap the scrim to dismiss (except while a delete is in progress). Back gesture dismisses.
- Keep one mounted trash icon across the menu and confirmation states. Animate its position and size between measured slots with a gentle spring (damping 0.6, stiffness 300); snap with reduced motion.
- Content changes inside the same sheet animate their height (`animateContentSize` or `AnimatedContent` with a size transform, 250ms) instead of opening a second sheet.
- Implementation hint: M3 `ModalBottomSheet` with `containerColor = Color.Transparent`, `dragHandle = null`, `tonalElevation = 0.dp`, `scrimColor = scrim`, and the content wrapped in a padded, clipped, `sheet`-colored Box.

## GohoSheetAction

- Row 60 tall, 20dp horizontal padding, 14dp gap. Leading 36dp circle with an 18dp icon, label in 16sp weight 600. Pressed: background `surfacePressed` (light) or `surfaceMutedPressed` (dark).
- Destructive tone (the only one used today): circle `dangerContainer`, icon and label `onDangerContainer`.

## GohoIconButton (round)

- 44dp circle, fill `surfaceMuted`, pressed `surfaceMutedPressed`, 20dp icon in `textPrimary`. Used for back and the overflow (three-dot, `MoreHoriz`) button on the details screen. (The photo viewer's close button is a GohoPhotoControlButton.)

## ReceiptFilter

- Separate tabs below the title, with a 6dp gap and no enclosing track. The selected tab has a subtle pill surface; unselected tabs blend into the header background.
- Tab: 36dp visible pill within a minimum 44dp tap target, 10dp horizontal padding, fully round, text 13sp weight 600.
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
  - **Processed:** amount in `textPrimary`. Foreign currency: prefix like "US$" in `textTertiary`, number in `textPrimary`. Tappable; opens details.
  - **Processing:** merchant "New receipt", date "Just now", trailing amount replaced by a 52×12 fully round shimmering skeleton, pill "Reading receipt…". Not tappable.
  - **Not processed:** merchant "Unknown receipt", amount "—" in `textTertiary`, pill "Not processed". Tappable; opens the receipt options sheet (it has no details screen).
- Pressed (Processed and Not processed rows): background `surfacePressed`, no scale. Cards clip their rows to the card's corners.
- Press and hold (Processed and Not processed rows; Processing rows ignore it): once it's clear the press is a hold (after about 150ms), ease to scale 0.98. Keep the normal surface fill throughout; no pressed highlight. When the long-press fires (the system long-press timeout, about 400–500ms): `HapticFeedbackType.LongPress`, the row springs back to scale 1, and the receipt options sheet opens. Releasing before the timeout is a normal tap. Implement with `Modifier.combinedClickable(onClick, onLongClick, onLongClickLabel = "Receipt options")` so TalkBack offers the action.
- Each row has a merged content description, for example "Cedar Hardware, US$23.21, Thursday September 24" or "Unknown receipt, not processed, today 8:14 AM".

## ReceiptCard (section)

- Section label above: `section` style, `textTertiary`, inset 4dp inside the screen margin (20dp from the edge), 8dp below.
- Card: `surface`, shape `card` 20, 4dp vertical padding. Edge treatment per theme (see Elevation in `tokens.md`). Rows separated by `divider` lines starting at 68dp.

## DetailList

- Card like above with 16dp horizontal padding. Rows 47 tall: label (`listRow`, `textSecondary`) left, value (`listRow` weight 600, `textPrimary`, proportional figures) right, dividers between rows. Read-only.
- A value that wasn't read shows "—" in `textTertiary`. Allow rows to grow for wrapped values; stack labels above values on narrow screens or with larger text.

## ItemsCard

The receipt's line items, given the same card treatment as Details so they read as primary content.

- Card like ReceiptCard: `surface`, shape `card` 20, theme edge treatment, 16dp horizontal padding, 2dp top padding.
- Item row: padding 14 top and bottom, 16dp gap. Name on the left (`listRow` at weight 500, `textPrimary`, up to 2 lines then ellipsis, top aligned). Line total on the right (`listValue`, `textPrimary`, proportional figures, no wrapping, no currency symbol, always two decimals). Hairline `divider` between item rows, spanning the card's inner width.
- Total row last: separated by a stronger 1dp rule (`textPrimary` at 10% in dark, 12% in light), padding 14 top / 16 bottom. "Total" in 15sp weight 700; amount in 17/22 weight 700, tracking −0.01em, proportional figures, with the currency symbol (foreign prefix like "US$" in `textTertiary`).
- Item amounts without symbols keep the column clean; the currency is shown once, on the Total.
- If an item has no amount, show "—" in `textTertiary`.

## Money formatting

One formatter for every amount in the app (list rows, hero, items, total):

- Exactly two fraction digits: `minimumFractionDigits = 2`, `maximumFractionDigits = 2`, half-even rounding, grouping separators on ("1,204.50").
- Home currency: local symbol ("$46.78"). Foreign: the short prefix ("US$23.21"), drawn in `textTertiary` where the spec says so.
- Item lines: the number only ("3.50").
- Missing: "—", never "0.00".

## PhotoFrame

- Full width inside the screen margin, shape `card` 20, radial gradient `photoWellCenter` → `photoWellEdge` behind the photo (drawn with `ContentScale.Fit`).
- The loaded photo area is the viewer tap target, with a “View receipt photo” accessibility action and Goho press feedback. Do not draw an expand button. Loading and missing photos have no click action.

## GohoPhotoControlButton

- The close button in the photo viewer.
- 44dp circle, fill `photoControl` (`#1D1B19` at 78%), 1dp inner border white at 8%, 17–20dp icon in `#F0EEEB`. Same look in both themes, because it always sits on a dark well or a photo.
- Uses the Goho press.

## Icons

Material Symbols **Rounded** (`material-icons-extended` `Icons.Rounded.*`) at weight around 500 so strokes match Manrope: back `AutoMirrored.Rounded.ArrowBack`, close `Close`, overflow `MoreHoriz`, delete `Delete` (outlined trash), scan `DocumentScanner` (or a custom four-corner viewfinder with a center line, which is what the mockup shows).
