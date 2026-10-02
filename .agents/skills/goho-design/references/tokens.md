# Goho tokens

All values are dp or sp. Colors were chosen in OKLCH; hex is what Compose uses.

## Color

Goho follows the system light/dark setting. Both palettes use the same token names; screens never branch on theme except where noted. The photo frame and photo viewer stay dark in both themes so receipts always sit on a dark well.

| Token                                        | Dark                  | Light                 | Use                                                         |
| -------------------------------------------- | --------------------- | --------------------- | ----------------------------------------------------------- |
| `background`                                 | `#13110F`             | `#F8F6F4`             | Screen background                                           |
| `surface`                                    | `#1D1B19`             | `#FFFFFF`             | Cards                                                       |
| `surfaceMuted`                               | `#1D1B19`             | `#EEECE9`             | Filter track, round icon buttons, thumbnail placeholder     |
| `surfaceMutedPressed`                        | `#2B2925`             | `#E3E1DD`             | Pressed round icon button                                   |
| `segmentSelected`                            | `#2B2925`             | `#FFFFFF`             | Selected filter segment                                     |
| `surfacePressed`                             | `#24221F`             | `#F5F3F0`             | Pressed row                                                 |
| `skeletonBase` / `skeletonShimmer`           | `#2B2925` / `#3A3733` | `#EBE9E6` / `#F8F6F4` | Amount skeleton while processing                            |
| `photoWellCenter` / `photoWellEdge`          | `#2A2724` / `#0C0B0A` | same                  | Photo frame gradient, viewer background (edge)              |
| `photoControl`                               | `#1D1B19` at 78%      | same                  | Expand and close buttons on the photo well (icon `#F0EEEB`) |
| `textPrimary`                                | `#F0EEEB`             | `#1D1A16`             | Wordmark, merchants, amounts, values                        |
| `textSecondary`                              | `#B7B4AF`             | `#58554F`             | Detail labels, merchant on details, filter text and counts  |
| `textTertiary`                               | `#928F88`             | `#726E67`             | Dates, section labels, "—", currency prefixes               |
| `divider`                                    | white 5%              | `#1D1A16` 6%          | Row separators inside cards                                 |
| `outline`                                    | white 6%              | `#1D1A16` 8%          | Thumbnail border                                            |
| `accent`                                     | `#74D3B6`             | `#207963`             | Scan and primary button fill (bottom), processing scan line |
| `accentTop`                                  | `#89E2C7`             | `#2D846D`             | Scan button fill (top)                                      |
| `accentPressed`                              | `#60BFA4`             | `#136A55`             | Scan button fill (bottom) while pressed                     |
| `onAccent`                                   | `#081D17`             | `#FFFFFF`             | Label and icon on Scan and primary buttons                  |
| `buttonSecondary` / `buttonSecondaryPressed` | `#2B2925` / `#24221F` | `#EEECE9` / `#E3E1DD` | Secondary button fill                                       |
| `accentContainer` / `onAccentContainer`      | `#1A342C` / `#74D3B6` | `#DAF4EA` / `#045B48` | "Reading receipt…" pill                                     |
| `accentShimmer`                              | `#D6F4EA`             | `#53B397`             | Shimmer highlight on "Reading receipt…"                     |
| `attention` / `attentionContainer`           | `#ED9658` / `#3F2717` | `#A34D16` / `#FFEADC` | "Not processed" pill, attention count badge                 |
| ---                                          | ---                   | ---                   | ---                                                         |
| `danger` / `dangerTop`                       | `#C52B2D` / `#D33B39` | `#BE2323` / `#CC3430` | Destructive button fill (bottom / top of gradient)          |
| `dangerPressed`                              | `#B01E22`             | `#A21A1B`             | Destructive button fill (bottom) while pressed              |
| `onDanger`                                   | `#FFFFFF`             | `#FFFFFF`             | Label and icon on the destructive button                    |
| `dangerContainer` / `onDangerContainer`      | `#4D1C1B` / `#F87E79` | `#FFE8E7` / `#B7191C` | Destructive menu icon and label; error text                 |
| `sheet`                                      | `#201E1B`             | `#FFFFFF`             | Bottom sheet surface                                        |
| `grabber`                                    | `#3F3D39`             | `#D9D6D1`             | Sheet drag handle                                           |
| `scrim`                                      | black 55%             | `#1D1A16` 38%         | Behind sheets                                               |

OKLCH sources (L C H): dark neutrals sit at hue 80 with chroma ≤ 0.01 (background 0.18, surface 0.225, raised 0.28); light neutrals at hue 80 (background 0.975, muted 0.945, text 0.22 / 0.45 / 0.54). Accent hue 172: dark 0.80 0.10, light 0.52 0.09. Attention hue about 50: dark 0.75 0.13, light 0.52 0.13. Danger hue about 26 (true red, used only for destructive actions): button dark 0.54 0.19, light 0.52 0.19.

Contrast (all at least 4.5:1): tertiary text is 5.8 (dark) / 4.7 (light) on background and 5.3 / 5.1 on cards. Don't put tertiary text on `surfaceMuted` in light (4.3:1), which is why filter counts use `textSecondary`. `onAccent` on `accent` is 9.8 / 5.3; `onDanger` on `danger` is 5.6 / 6.1 (4.7 / 5.1 on the gradient top); `onDangerContainer` on `dangerContainer` is 5.5 / 5.7; on `accentTop` in light it is 4.5. Pill text on its container is 7.5 / 7.0 (accent) and 6.0 / 5.0 (attention).

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

The currency prefix for foreign amounts ("US$") is drawn in `textTertiary` at the same size as the number in rows, and at 28sp beside a 44sp display amount.

## Shape

| Token    | Radius | Use                                                                      |
| -------- | ------ | ------------------------------------------------------------------------ |
| `thumb`  | 8      | Receipt thumbnails in rows                                               |
| `button` | 16     | Primary and secondary buttons (not fully round)                          |
| `card`   | 20     | Grouped list cards, detail card, photo frame                             |
| `fab`    | 20     | Scan button                                                              |
| `pill`   | 50%    | Status pills, count badge, filter track and segments, round icon buttons |
| ---      | ---    | ---                                                                      |
| `sheet`  | 28     | Floating bottom sheet (all four corners)                                 |

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

Shadows stay small and crisp. Dark mode relies on a 1dp top highlight; light mode relies on a faint ring plus a soft shadow.

| Element                 | Dark                                                        | Light                                                         |
| ----------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Cards                   | no shadow, 1dp top highlight white 3%                       | 1dp ring `#1D1A16` 5% + 1dp shadow at low alpha, no highlight |
| Selected filter segment | 1dp black shadow, top highlight white 6%                    | 1dp shadow `#1D1A16`, no highlight                            |
| Scan FAB at rest        | 3dp black shadow, top highlight white 45%                   | 3dp shadow in `#104638`, top highlight white 22%              |
| Scan FAB pressed        | 0.5dp, highlight 25%                                        | 0.5dp, highlight 12%                                          |
| Primary button          | 2dp shadow, highlight 45% → pressed 0.5dp, 25%              | 2dp shadow in `#104638`, highlight 22% → 0.5dp, 12%           |
| Secondary button        | 1dp shadow, highlight 6% → pressed flat                     | flat, no shadow or highlight                                  |
| Round icon button       | none; fill steps to `surfaceMutedPressed` when pressed      | same                                                          |
| ---                     | ---                                                         | ---                                                           |
| Destructive button      | 2dp black shadow, highlight 18% → pressed 0.5dp, 10%        | 2dp shadow in `#6E0F0F`, highlight 18% → 0.5dp, 10%           |
| Bottom sheet            | 1dp ring white 5%, top highlight 5%, 16dp soft black shadow | 1dp ring `#1D1A16` 4%, 12dp soft shadow `#1D1A16` 30%         |

The top highlight is a 1dp line drawn inside the clipped shape at the top edge, not an inset shadow.

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

- Foreign hero prefix: 28sp / 36sp, weight 600, −0.025em tracking.
