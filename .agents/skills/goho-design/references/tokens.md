# Goho tokens

All values are dp or sp. Colors were chosen in OKLCH; hex is what Compose uses.

## Color

Goho follows the system light/dark setting. Both palettes use the same token names; screens never branch on theme except where noted. The photo frame and photo viewer stay dark in both themes so receipts always sit on a dark well.

| Token                                        | Dark                  | Light                    | Use                                                                  |
| -------------------------------------------- | --------------------- | ------------------------ | -------------------------------------------------------------------- |
| `background`                                 | `#15141D`             | `#FBF8F4`                | Screen background, bottom scrim                                      |
| `surface`                                    | `#1F1E2A`             | `#FFFFFF`                | Cards                                                                |
| `surfaceMuted`                               | `#1F1E2A`             | `#F1EEF4`                | Round icon buttons, thumbnail placeholder                            |
| `surfaceMutedPressed`                        | `#2B2A38`             | `#E6E2EC`                | Pressed round icon button                                            |
| `segmentSelected`                            | `#2B2A38`             | `#FFFFFF`                | Selected filter tab                                                  |
| `surfacePressed`                             | `#252432`             | `#F7F4F9`                | Pressed row                                                          |
| `skeletonBase` / `skeletonShimmer`           | `#2B2A38` / `#3A3948` | `#ECE9F1` / `#FBF8F4`    | Amount skeleton while processing                                     |
| `photoWellCenter` / `photoWellEdge`          | `#2A2833` / `#0C0B10` | same                     | Photo frame gradient, viewer background (edge)                       |
| `photoControl`                               | `#1F1E2A` at 78%      | same                     | Photo controls on the photo well (icon `#F1EFF8`)                    |
| `textPrimary`                                | `#F1EFF8`             | `#26233A`                | Title, merchants, amounts, values                                    |
| `textSecondary`                              | `#BBB8CC`             | `#5B5870`                | Detail labels, merchant on details, filter text and counts           |
| `textTertiary`                               | `#9794AB`             | `#6E6A83`                | Dates, section labels, "—", currency codes                           |
| `divider`                                    | white 5%              | `#26233A` 6%             | Row separators inside cards                                          |
| `outline`                                    | white 6%              | `#26233A` 8%             | Thumbnail border, light card ring                                    |
| `accent`                                     | `#A6ABF0`             | `#8B91D6`                | Scan and primary button fill, processing scan line (Bram periwinkle) |
| `accentRing`                                 | `#8288D2`             | `#767CC2`                | Thin edge ring on Scan and primary buttons                           |
| `accentPressed`                              | `#959AE3`             | `#7D83CB`                | Scan and primary button fill while pressed                           |
| `onAccent`                                   | `#17183D`             | `#1B1C45`                | Label and icon on Scan and primary buttons (deep indigo, not white)  |
| `buttonSecondary` / `buttonSecondaryPressed` | `#2B2A38` / `#252432` | `#FFFFFF` / `#F7F4F9`    | Secondary button fill                                                |
| `statusCard` / `statusCardRing`              | white 2.5% / white 7% | white 60% / `#26233A` 6% | StatusCard fill and 1dp ring                                         |
| `accentContainer` / `onAccentContainer`      | `#2A2C50` / `#B7BBF6` | `#E9E9FB` / `#444AA0`    | "Reading receipt…" pill                                              |
| `accentShimmer`                              | `#E4E5FD`             | `#9CA1E6`                | Shimmer highlight on "Reading receipt…"                              |
| `attention` / `attentionContainer`           | `#F2A07C` / `#43271C` | `#A6472A` / `#FFE8DD`    | "Not processed" pill, attention count badge                          |
| `danger` / `dangerRing`                      | `#CF4440` / `#A9302D` | `#D2443F` / `#B33532`    | Destructive button fill and its edge ring                            |
| `dangerPressed`                              | `#BA3A36`             | `#BE3A36`                | Destructive button fill while pressed                                |
| `onDanger`                                   | `#FFFFFF`             | `#FFFFFF`                | Label and icon on the destructive button                             |
| `dangerContainer` / `onDangerContainer`      | `#4B1E20` / `#F7908A` | `#FFE9E7` / `#B42A26`    | Delete row icon and label                                            |
| `sheet`                                      | `#22212E`             | `#FFFFFF`                | Bottom sheet surface                                                 |
| `grabber`                                    | `#42404F`             | `#DAD6E0`                | Sheet drag handle                                                    |
| `scrim`                                      | black 55%             | `#26233A` 34%            | Behind sheets                                                        |

Palette source: Bram, the Goho mascot (`assets/brand/`). His periwinkle body (`#8E94D0`, light `#B0B1EB`, shade `#7C81BB`) gives the accent; his ivory horns (`#F4DEC7`) and the approved sheet's warm paper (`#FCF9F3`) give the light neutrals; dark neutrals are a deep indigo-charcoal at very low chroma rather than warm brown. Attention stays a warm terracotta and danger a true red, used only for destructive actions.

Contrast (all at least 4.5:1): `textTertiary` is 6.2 (dark) / 4.9 (light) on background and 5.6 / 5.2 on cards; `textSecondary` on `surfaceMuted` is 8.5 / 5.9. `onAccent` on `accent` is 7.9 / 5.5 (6.5 / 4.6 pressed). `onDanger` on `danger` is 4.6 / 4.5; `onDangerContainer` on `dangerContainer` is 6.2 / 5.5. Pill text on its container is 7.3 / 6.4 (accent) and 6.5 / 5.0 (attention). The light accent is a mid-tone, so its label is deep indigo (`onAccent`), never white.

## Typography

Font: **Geist** (Google Fonts, OFL), weights 400, 500 and 600 only. Bundle the TTFs in `res/font` rather than using downloadable fonts, so the first frame renders correctly offline. Use `fontFeatureSettings = "'tnum' 0, 'pnum' 1"` throughout the app. Amounts, dates, counts and times use proportional figures. Metadata and labels use zero tracking. This approved preference takes precedence over tabular examples in the supplied mockups.

Weights: Geist gets heavy quickly, so nothing in the app uses 700. Titles and big amounts are SemiBold (600), names, prices, filters, section labels, pills and secondary buttons are Medium (500), and dates, detail labels and body text are Regular (400). Primary, Scan and danger buttons use SemiBold (600), as in the token table.

| Style      | Size / line height | Weight | Tracking | Use                                                                                          |
| ---------- | ------------------ | ------ | -------- | -------------------------------------------------------------------------------------------- |
| `display`  | 44 / 48            | 600    | −0.035em | Receipt amount on details                                                                    |
| `title`    | 22 / 28            | 600    | −0.025em | Screen title ("New receipt")                                                                 |
| `wordmark` | 32 / 36            | 600    | −0.035em | "goho" in the list header (lowercase)                                                        |
| `rowTitle` | 16 / 22            | 500    | −0.01em  | Merchant and amount in list rows; merchant on details (in `textSecondary`); sheet menu items |
| `button`   | 16 / 20            | 600    | 0        | Scan, primary and danger button labels (secondary buttons use 500)                           |
| `listRow`  | 15 / 20            | 400    | 0        | Detail list and item names (values use 500)                                                  |
| `body`     | 15 / 22            | 400    | 0        | Error line above the confirmation buttons                                                    |
| `meta`     | 13 / 18            | 400    | 0        | Dates, sub-lines                                                                             |
| `section`  | 13 / 18            | 500    | 0        | "Today", "Details", "Items" section labels                                                   |
| `label`    | 12 / 16            | 500    | 0        | Pills, badges                                                                                |

Sheet header: store name 18/24 SemiBold −0.015em; price 15/20 Medium with the date in 15/20 Regular `textTertiary`.

Currency codes follow the symbol and amount, baseline aligned in `textTertiary`: `heroCurrencyCode` is 20/26sp SemiBold, zero tracking, beside the 44sp display amount; `currencyCode` is 12/16sp Medium, zero tracking, beside receipt-list totals only. All other amounts keep the symbol without repeating the code. Example: “$46.78 CAD”.

## Shape

| Token        | Radius | Use                                                        |
| ------------ | ------ | ---------------------------------------------------------- |
| `thumb`      | 10     | Receipt thumbnails in rows                                 |
| `sheetThumb` | 12     | Receipt photo in the sheet header                          |
| `heldRow`    | 18     | Row highlight while held                                   |
| `button`     | 20     | Primary and secondary buttons (not fully round)            |
| `card`       | 24     | Grouped list cards, detail card, photo frame               |
| `fab`        | 24     | Scan button                                                |
| `statusCard` | 32     | Empty and error StatusCard                                 |
| `sheet`      | 32     | Floating bottom sheet (all four corners)                   |
| `pill`       | 50%    | Status pills, count badge, filter tabs, round icon buttons |

Bram's softer look: every radius grew by 2 to 4dp from the October 2 package, so surfaces read as cushioned rather than crisp.

Plain `RoundedCornerShape` is fine. If the project already has a smooth-corner (squircle) shape, prefer it for `card`, `fab` and `button`.

## Spacing and layout

- 4dp grid.
- `screenMargin` = 16: edges of cards, the filter and the FAB.
- `textInset` = 20: text that sits directly on the background (screen title, section labels, detail hero). It is inset 4dp further than surfaces so it lines up optically with card content.
- `cardPadding` = 16 horizontal; cards have 4dp vertical padding and rows supply their own.
- List row: min height 72, vertical padding 12, thumbnail 40×48, thumbnail-to-text gap 12. Dividers start at 68dp (16 + 40 + 12) and run to the card edge.
- Detail list row: height 47, label left, value right.
- Section spacing: 24 above a section label, 8 below it.
- Header: screen title row is 44 tall and starts at the status bar inset + 4dp.
- Bottom: FAB sits 28dp above the navigation bar inset, 16dp from the right.

## Elevation and shadow

Shadows are soft and wide rather than tight. Dark mode relies on a 1dp top highlight on cards; light mode on a faint ring plus a soft shadow.

**Button treatment** (Scan FAB, primary, danger and secondary buttons): a flat fill (no gradient), a thin ring 1dp inside the edge in a darker shade of the fill, a second faint light ring 1dp further in, and a soft, wide drop shadow.

| Button                                                                                                                                       | Ring (outer / inner)  | Shadow                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------- |
| Primary and Scan, light                                                                                                                      | `#767CC2` / white 22% | 0 1 2 at 16% + 0 12 28 (−8 spread) at 32%, both `#3A3D86` |
| Primary and Scan, dark                                                                                                                       | `#8288D2` / white 22% | 0 1 2 at 40% + 0 12 28 (−8) at 60%, black                 |
| Danger, light                                                                                                                                | `#B33532` / white 14% | 0 1 2 at 16% + 0 12 28 (−8) at 32%, `#7A1F1C`             |
| Danger, dark                                                                                                                                 | `#A9302D` / white 16% | as primary dark                                           |
| Secondary, light                                                                                                                             | `#26233A` 6% / none   | 0 1 2 at 5% + 0 12 28 (−10) at 18%, `#26233A`             |
| Secondary, dark                                                                                                                              | white 8% / none       | 0 1 2 at 40% + 0 12 28 (−10) at 60%, black                |
| Pressed: the fill steps to its pressed color, the wide shadow drops away (keep the 0 1 2 shadow), plus the Goho press (97% scale, 1dp down). |

| Element                 | Dark                                                        | Light                                                         |
| ----------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Cards                   | no shadow, 1dp top highlight white 3%                       | 1dp ring `#26233A` 5% + 1dp shadow at low alpha, no highlight |
| StatusCard              | 1dp ring white 7% on white 2.5%                             | 1dp ring `#26233A` 7% on white 55%                            |
| Selected filter segment | 1dp black shadow, top highlight white 6%                    | 1dp shadow `#26233A`, no highlight                            |
| Round icon button       | none; fill steps to `surfaceMutedPressed` when pressed      | same                                                          |
| Bottom sheet            | 1dp ring white 5%, top highlight 5%, 16dp soft black shadow | 1dp ring `#26233A` 4%, 12dp soft shadow `#26233A` 30%         |

## Motion

- **Press:** progress `p` goes 0→1 with `tween(90ms)` on press and back with `spring(dampingRatio = 0.55f, stiffness = 700f)` on release (the overshoot gives the friendly bounce). Scale = 1 − 0.03·p, translationY = 1dp·p, shadow and fill interpolate with p clamped to 0..1.
- **Filter switch:** selected tab fill expands from 86% width and 90% height with `spring(dampingRatio = 0.6f, stiffness = 240f)`. Only the fill grows and gently overshoots; label geometry and touch targets stay fixed. Clamp selection progress for colors and elevation, keep the surface opaque, and switch immediately with reduced motion.
- **Processing shimmer:** a highlight sweeps across the "Reading receipt…" text and the amount skeleton every 1.8s, linear, infinite. Shimmer colors: text `onAccentContainer` → `accentShimmer` → `onAccentContainer`; skeleton `skeletonBase` → `skeletonShimmer` → `skeletonBase`.
- **Row → detail (nice to have):** shared-element transition from the row thumbnail to the detail photo frame.
- **Reduced motion:** when the animator duration scale is 0, shimmer is static and the press has no spring overshoot.

## Receipt header and timestamps

- List title: “Receipts”, using `screenTitle` (24sp / 30sp, weight 600, −0.015em tracking).
- Separate filter tabs remain below the title, without an enclosing track: 13sp / 18sp, 10dp horizontal padding, 5dp count gaps, 36dp visible selected pill within at least 44dp tap targets. No scroll transition. Use weight 500 and retain one light haptic per completed filter click.
- `timestamp`: Geist 400, 13sp / 18sp, zero tracking, proportional digit widths.
- Receipt placeholders: 20×28dp symbols, 1.5dp stroke, centered in the existing 40×48dp thumbnail.

## Receipt item card

- Item rows: 14dp vertical padding, 16dp gap, 15sp / 20sp name and amount; amount weight 500.
- Total: 15sp / 20sp weight 600 label and 17sp / 22sp weight 600 amount, −0.01em tracking.
- Exactly two decimal places for every money amount, half-even rounding, locale grouping, proportional figures.

- Show the trailing currency code only beside the details hero and receipt-list totals; omit it from other amounts.
