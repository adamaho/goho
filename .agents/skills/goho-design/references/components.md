# Goho components

Reference implementations live in `assets/compose/GohoComponents.kt`. Every pressable uses the Goho press (`Modifier.gohoPressTransform`) with `indication = null`. Only the components below are needed; don't add others without a design.

## GohoScanFab

- 56 tall, shape `fab` 20, padding 18 left / 22 right.
- Fill: vertical gradient `accentTop` → `accent`. Pressed: `accent` → `accentPressed`.
- Content: scan icon 22dp, 9dp gap, "Scan" in `button` style, color `onAccent`. Content description "Scan receipt".
- Shadow 3dp at rest, 0.5dp pressed; 1dp top highlight white 45% → 25%.
- Placed bottom right over a bottom scrim: a 128dp vertical gradient from transparent to `background` (0 → 90% at 65% → 100%), so rows fade out under it.

## GohoPrimaryButton

- Full width inside the screen margin, 52 tall, shape `button` 16 (not a pill), horizontal padding 20.
- Fill: vertical gradient `accentTop` → `accent`; pressed `accent` → `accentPressed`. Shadow and highlight per tokens.
- Content: optional 18dp icon, 8dp gap, label in `button` style, color `onAccent`.
- Disabled: whole button at 40% alpha, no press, not clickable.

## GohoSecondaryButton

- Same geometry. Fill `buttonSecondary`, pressed `buttonSecondaryPressed`. Label `button` style at weight 600 in `textPrimary`, optional 18dp icon.
- Stack under a primary button with a 10dp gap. Don't use text-only link buttons for actions.

## GohoIconButton (round)

- 44dp circle, fill `surfaceMuted`, pressed `surfaceMutedPressed`, 20dp icon in `textPrimary`. Used for back on the details screen and close in the photo viewer.

## GohoSegmentedFilter

- Track: `surfaceMuted`, fully round, 3dp padding, 2dp gap, wraps its content (not full width).
- Segment: 34 tall, 14 horizontal padding, fully round, text 14sp weight 600.
- Selected: fill `segmentSelected`, 1dp shadow (plus a 6% top highlight in dark only), text `textPrimary`. Unselected: transparent, text `textSecondary`.
- "All" shows its count in `textSecondary` after a 7dp gap. "Needs attention" shows a count badge: min 20×20, fully round, `attentionContainer` fill, `attention` text, `label` style. Hide the badge when the count is 0.

## GohoStatusPill

- Height 22, horizontal padding 9, fully round, `label` style.
- Tones: `Accent` (`accentContainer` / `onAccentContainer`) for "Reading receipt…", with the shimmer; `Attention` (`attentionContainer` / `attention`) for "Not processed".

## ReceiptThumbnail

- 40×48, shape `thumb` 8, image cropped center, 1dp border in `outline`.
- Processing: overlay the top 45% with `accent` at 18% and draw a 1.5dp `accent` line at its bottom edge (a static "scan line").
- No image yet: `surfaceMuted` fill.

## ReceiptRow

Row inside a card: `thumbnail | column(line 1, line 2)`.

- Line 1: merchant (`rowTitle`, `textPrimary`, single line, ellipsis) … trailing amount (`rowTitle`, tnum).
- Line 2 (5dp below): date (`meta`, `textTertiary`) … optional trailing status pill.
- States:
  - **Processed:** amount in `textPrimary`. Foreign currency: prefix like "US$" in `textTertiary`, number in `textPrimary`. Tappable; opens details.
  - **Processing:** merchant "New receipt", date "Just now", trailing amount replaced by a 52×12 fully round shimmering skeleton, pill "Reading receipt…". Not tappable.
  - **Not processed:** merchant "Unknown receipt", amount "—" in `textTertiary`, pill "Not processed". Not tappable.
- Pressed (processed rows only): background `surfacePressed`, no scale.
- Each row has a merged content description, for example "Cedar Hardware, US$23.21, Thursday September 24" or "Unknown receipt, not processed, today 8:14 AM".

## ReceiptCard (section)

- Section label above: `section` style, `textTertiary`, inset 4dp inside the screen margin (20dp from the edge), 8dp below.
- Card: `surface`, shape `card` 20, 4dp vertical padding. Edge treatment per theme (see Elevation in `tokens.md`). Rows separated by `divider` lines starting at 68dp.

## DetailList

- Card like above with 16dp horizontal padding. Rows 47 tall: label (`listRow`, `textSecondary`) left, value (`listRow` weight 600, `textPrimary`, tnum) right, dividers between rows. Read-only.
- A value that wasn't read shows "—" in `textTertiary`.

## PhotoFrame

- Full width inside the screen margin, shape `card` 20, radial gradient `photoWellCenter` → `photoWellEdge` behind the photo (drawn with `ContentScale.Fit`).
- Expand button: 44dp circle 10dp from the bottom-right corner, fill `photoControl`, 1dp inner border white 8%, 17dp expand icon in `#F0EEEB`. The frame and button look the same in both themes. Content description "Expand photo".

## Icons

Material Symbols **Rounded** (`material-icons-extended` `Icons.Rounded.*`) at weight around 500 so strokes match Manrope: back `AutoMirrored.Rounded.ArrowBack`, close `Close`, expand `OpenInFull`, scan `DocumentScanner` (or a custom four-corner viewfinder with a center line, which is what the mockup shows).
