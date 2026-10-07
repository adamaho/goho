# Goho components

Deletion components and row interactions describe the October 2 v2 target design. Verify server support and implement them only as part of a requested deletion feature.

Reference implementations live in `assets/compose/GohoComponents.kt`. Every pressable uses the Goho press (`Modifier.gohoPressTransform`) with `indication = null`. Only the components below are needed; don't add others without a design.

## GohoScanFab

- 56 tall, shape `fab` 24, padding 18 left / 22 right.
- Fill: flat `accent`; pressed `accentPressed`. Edge and shadow: the button treatment in `tokens.md` (thin darker ring, faint inner light ring, soft wide shadow).
- Content: scan icon 22dp, 9dp gap, "Scan" in `button` style, color `onAccent`. Content description "Scan receipt".
- Placed bottom right over the list without a bottom gradient. Keep enough list padding for the final row to scroll clear of the button.

## GohoPrimaryButton

- Full width inside the screen margin, 52 tall, shape `button` 20 (not a pill), horizontal padding 20.
- Fill: flat `accent`; pressed `accentPressed`. Edge and shadow per the button treatment in `tokens.md`.
- Content: optional 18dp icon, 8dp gap, label in `button` style, color `onAccent`.
- Disabled: whole button at 40% alpha, no press, not clickable.

## GohoSecondaryButton

- Same geometry. Fill `buttonSecondary` (white in light, raised violet-charcoal in dark), pressed `buttonSecondaryPressed`, with a faint ring and the same soft shadow (see `tokens.md`). Label `button` style at weight 500 in `textPrimary`, optional 18dp icon.
- Stack under a primary button with a 10dp gap. Don't use text-only link buttons for actions.

## GohoDangerButton

- Same geometry as GohoPrimaryButton (52 tall, shape `button` 20, full width). Fill: flat `danger`; pressed `dangerPressed`. Edge and shadow per the button treatment in `tokens.md`. Label `button` style in `onDanger`, optional 18dp trash icon.
- Only for the final confirming action of something destructive. Red is never used for anything else.

## Status content (empty and error states)

- Full width inside the screen margin, padding 28 top / 24 sides / 32 bottom (24 bottom when it has a button). Content centered directly on the screen background. No enclosing card fill, border or rounded clipping in any list status state.
- Use the shared status content for no receipts, needs attention and load error. Preserve the shared padding, spacing, entrance and centered placement; the Scan footer stays separate when present.
- No receipts and empty Needs attention show an illustration (220×190dp), followed by a 14dp gap before the title. Load error omits both the illustration and this gap. Title is 20/26 SemiBold −0.02em `textPrimary`, followed by a 6dp gap before body text in `body` `textSecondary` (max width 290dp), then an optional full-width button 22dp below.
- Illustration assets live in `assets/illustrations/`. No receipts uses `status-no-receipts.png`; empty Needs attention uses the calm thumbs-up `status-needs-attention.png`. Both PNGs are 1350×1165 RGBA, with each state using the same transparent asset in both themes. Preserve the artwork unchanged and render with `ContentScale.Fit` in the existing slot up to 220dp wide with a 220:190 aspect ratio. These two poses and the neutral Bram stance/header mark are current; dedicated artwork for other states is deferred until its feature is implemented. The older SVGs in `legacy/` are not sources for these Bram images.
- The illustration is decorative (`contentDescription = null`); the title is a heading and the title/body group carries the meaning. Only the load-error content is a polite live region.
- Entrance: one 200ms fade with a 6dp upward settle; no looping character animation. Successful retry crossfades the whole error screen to the loaded state in 200ms without replaying the incoming status entrance. With reduced motion, render the final state immediately.
- The retry button reserves space for both “Try again” and “Trying again…” at the current font scale. Hidden measurement labels have no semantics. Disable the button while retrying and preserve its bounds after failure.

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

- 44dp circle, fill `surfaceMuted`, pressed `surfaceMutedPressed`, 20dp icon in `textPrimary`. Used for back and the overflow (three-dot, `MoreHoriz`) button on the details screen. (The photo viewer's close button is a GohoPhotoControlButton.)

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
- 44dp circle, fill `photoControl` (`#1D1B19` at 78%), 1dp inner border white at 8%, 17–20dp icon in `#F0EEEB`. Same look in both themes, because it always sits on a dark well or a photo.
- Uses the Goho press.

## Icons

Material Symbols **Rounded** (`material-icons-extended` `Icons.Rounded.*`) at weight around 500 so strokes match Geist: back `AutoMirrored.Rounded.ArrowBack`, close `Close`, overflow `MoreHoriz`, delete `Delete` (outlined trash), scan `DocumentScanner` (or a custom four-corner viewfinder with a center line, which is what the mockup shows).
