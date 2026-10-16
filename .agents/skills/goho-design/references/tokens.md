# Goho tokens

All values are dp or sp. Button finishes follow the October 14 glossy/frosted update; layout and illustration tokens retain the approved Bram design.

## Color

Goho follows the system light/dark setting. Both palettes use the same token names; screens never branch on theme except where noted. The photo frame and photo viewer stay dark in both themes so receipts always sit on a dark well.

| Token                                        | Dark                          | Light                         | Use                                                                  |
| -------------------------------------------- | ----------------------------- | ----------------------------- | -------------------------------------------------------------------- |
| `background`                                 | `#15141D`                     | `#F5F4FD`                     | Screen background                                                    |
| `surface`                                    | `#1F1E2A`                     | `#FFFFFF`                     | Cards                                                                |
| `surfaceMuted`                               | `#1F1E2A`                     | `#F0EFF7`                     | Round icon buttons, thumbnail placeholder                            |
| `surfaceMutedPressed`                        | `#2B2A38`                     | `#E4E2EE`                     | Pressed round icon button                                            |
| `segmentSelected`                            | `#2B2A38`                     | `#FFFFFF`                     | Selected filter segment                                              |
| `surfacePressed`                             | `#252432`                     | `#F5F4FA`                     | Pressed row                                                          |
| `skeletonBase` / `skeletonShimmer`           | `#2B2A38` / `#3A3948`         | `#EAE8F3` / `#F5F4FD`         | Amount skeleton while processing                                     |
| `photoWellCenter` / `photoWellEdge`          | `#2A2724` / `#0C0B0A`         | `#2A2724` / `#0C0B0A`         | Photo frame gradient, viewer background (edge)                       |
| `photoControl`                               | `#1D1B19` 78%                 | same                          | Close button on the photo well (icon `#F0EEEB`)                      |
| `textPrimary`                                | `#F1EFF8`                     | `#26233A`                     | Titles, merchants, amounts, values                                   |
| `textSecondary`                              | `#BBB8CC`                     | `#5B5870`                     | Detail labels, merchant on details, filter text and counts           |
| `textTertiary`                               | `#9794AB`                     | `#6E6A83`                     | Dates, section labels, "—", currency codes                           |
| `divider`                                    | white 5%                      | `#26233A` 6%                  | Row separators inside cards                                          |
| `outline`                                    | white 6%                      | `#26233A` 8%                  | Thumbnail border                                                     |
| `accent`                                     | `#A6ABF0`                     | `#8B91D6`                     | Processing and refresh indicators                                    |
| `accentRing`                                 | `#353B70`                     | same                          | Lower edge of glossy primary buttons                                 |
| `accentPressed`                              | `#959AE3`                     | `#7D83CB`                     | Reserved lavender pressed colour                                     |
| `onAccent`                                   | `#17183D`                     | `#1B1C45`                     | Foreground paired with the lighter accent in Material theme mappings |
| `buttonPrimary` / `buttonPrimaryPressed`     | `#5059A6` / `#414A8C`         | same                          | Glossy primary and Scan fill                                         |
| `onButtonPrimary`                            | `#FFFFFF`                     | same                          | Primary labels, icons and loading arcs                               |
| `buttonSecondary` / `buttonSecondaryPressed` | `#1F1E27` 94% / `#191820` 98% | `#FAF8FD` 96% / `#F0ECF6` 98% | Frosted secondary fill                                               |
| `statusCard` / `statusCardRing`              | white 2.5% / white 7%         | white 60% / `#26233A` 6%      | Legacy status-card fill and ring; unused by current states           |
| `accentContainer` / `onAccentContainer`      | `#2A2C50` / `#B7BBF6`         | `#E9E9FB` / `#444AA0`         | "Reading receipt…" pill                                              |
| `accentShimmer`                              | `#E4E5FD`                     | `#9CA1E6`                     | Shimmer highlight on "Reading receipt…"                              |
| `attention` / `attentionContainer`           | `#ED9658` / `#3F2717`         | `#A34D16` / `#FFEADC`         | "Not processed" pill, attention count badge                          |
| `danger` / `dangerRing`                      | `#C52B2D` / `#A21F22`         | `#BE2323` / `#9A1A1B`         | Destructive button fill and its edge ring                            |
| `dangerPressed`                              | `#B01E22`                     | `#A21A1B`                     | Destructive button fill while pressed                                |
| `onDanger`                                   | `#FFFFFF`                     | `#FFFFFF`                     | Label and icon on the destructive button                             |
| `dangerContainer` / `onDangerContainer`      | `#4D1C1B` / `#F87E79`         | `#FFE8E7` / `#B7191C`         | Delete row icon and label, deletion error text                       |
| `sheet`                                      | `#1F1E2A`                     | `#FFFFFF`                     | Bottom sheet surface                                                 |
| `grabber`                                    | `#3A3948`                     | `#D9D6E2`                     | Sheet drag handle                                                    |
| `scrim`                                      | black 55%                     | `#26233A` 38%                 | Behind sheets                                                        |

Light mode uses a pale lavender background (`#F5F4FD`, approximately 247° hue) aligned with dark `#15141D`; muted surfaces, pressed rows and skeletons follow the same violet neutral family. White cards and sheets retain their separation. The accent is lavender in both themes; attention stays orange and destructive actions stay red. Bottom sheets use the same violet neutrals as other surfaces in every menu, confirmation, deleting and error state. Photo wells retain their existing values. Do not infer new OKLCH source coordinates from the previous jade palette.

Contrast measured from the opaque sRGB token pairs (dark / light):

- `textTertiary` on `background`: 6.21:1 / 4.75:1.
- `textTertiary` on `surface`: 5.59:1 / 5.18:1.
- `textTertiary` on `surfaceMuted`: 5.59:1 / 4.54:1.
- `onAccent` on `accent`: 7.86:1 / 5.48:1.
- `onAccentContainer` on `accentContainer`: 7.27:1 / 6.41:1.
- `attention` on `attentionContainer`: 6.01:1 / 4.97:1.

Filter text and counts use `textSecondary`. The primary hue follows Bram’s blue-lavender body (approximately 234° HSV), darkened for white text rather than shifted toward red-violet. Primary and Scan use white `onButtonPrimary` in both themes: 6.32:1 on the base, at least 5.52:1 across the entire unpressed gradient, and at least 6.94:1 when pressed. Black reaches only 3.81:1 even at the brightest gradient point, failing the 4.5:1 normal-text requirement. Edge highlights are outside the content inset. Disabled actions retain the existing 40% opacity and are exempt from active-control contrast requirements.

## Typography

Font: **Geist** (Google Fonts, OFL), weights 400, 500 and 600 only. Bundle the TTFs in `res/font` rather than using downloadable fonts, so the first frame renders correctly offline. Use `fontFeatureSettings = "'tnum' 0, 'pnum' 1"` throughout the app. Amounts, dates, counts and times use proportional figures. Metadata and labels use zero tracking. This approved preference takes precedence over tabular examples in the supplied mockups.

Weights: Geist gets heavy quickly, so nothing in the app uses 700. Titles and big amounts are SemiBold (600), names, prices, filters, section labels, pills and secondary buttons are Medium (500), and dates, detail labels and body text are Regular (400). Primary, Scan and danger buttons use SemiBold (600), as in the token table.

| Style      | Size / line height | Weight | Tracking | Use                                                                                          |
| ---------- | ------------------ | ------ | -------- | -------------------------------------------------------------------------------------------- |
| `display`  | 44 / 48            | 600    | −0.035em | Receipt amount on details                                                                    |
| `title`    | 22 / 28            | 600    | −0.025em | Screen title ("New receipt")                                                                 |
| `wordmark` | 32 / 36            | 600    | −0.035em | Legacy wordmark; the app uses `screenTitle` “Receipts”                                       |
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

| Token        | Radius | Use                                                            |
| ------------ | ------ | -------------------------------------------------------------- |
| `thumb`      | 8      | Receipt thumbnails in rows                                     |
| `button`     | 20     | Primary and secondary buttons (not fully round)                |
| `card`       | 20     | Grouped list cards, detail card, photo frame                   |
| `fab`        | 24     | Scan button                                                    |
| `pill`       | 50%    | Status pills, count badge, filter segments, round icon buttons |
| `statusCard` | 32     | Legacy status-card shape; unused by current states             |
| `sheet`      | 28     | Floating bottom sheet (all four corners)                       |

Plain `RoundedCornerShape` is fine. If the project already has a smooth-corner (squircle) shape, prefer it for `card`, `fab` and `button`.

## Spacing and layout

- 4dp grid.
- `screenMargin` = 16: edges of cards, the filter and the FAB.
- `textInset` = 20: text that sits directly on the background (screen title, section labels, detail hero). It is inset 4dp further than surfaces so it lines up optically with card content.
- `cardPadding` = 16 horizontal; cards have 4dp vertical padding and rows supply their own.
- List row: min height 72, vertical padding 12, thumbnail 40×48, thumbnail-to-text gap 12. Dividers start at 68dp (16 + 40 + 12) and run to the card edge.
- Detail list row: height 47, label left, value right.
- Section spacing: 24 above a section label, 8 below it.
- Header: text-only title row is at least 44 tall at status bar inset + 4dp. The Receipts title uses the 20dp text inset in every state; no Bram header mark.
- Status illustrations: no receipts, empty Needs attention and load error use the existing 220×190 slot and 4dp title gap. Fit each transparent asset unchanged in both themes.
- Loading: `loadingIcon` = 24dp for initial receipt loading; retry reuses `buttonIcon` = 18dp. Both use `iconStroke` = 2dp.
- Bottom: FAB sits 28dp above the navigation bar inset, 16dp from the right.

## Elevation and shadow

Shadows are soft and wide rather than tight. Dark mode relies on a 1dp top highlight on cards; light mode on a faint ring plus a soft shadow.

**Button treatment** (numbered finish × independent colour): shared native `GohoButtonSurface.kt`, with existing 20dp action / 24dp Scan corners. Colour chooses the base/pressed pair and content independently of the finish: Purple uses deep-periwinkle and white, Red uses red and white, Grey uses the theme’s neutral face and `textPrimary`. Variant 1 applies the glossy finish; variant 2 applies the frosted/rimmed finish. Existing primary/Scan, destructive and secondary actions use 1/Purple, 1/Red and 2/Grey respectively. The variant 1 face runs from white 6% over the fill at the top, through the fill at 45%, to black 14% over the fill at the bottom. Pressed colours use the same finish. No bright shine crosses the label.

For variant 1 and light variant 2, the 1dp outer rim runs from white 85% (light) / 62% (dark) at the top to the variant's edge colour at 45%. A second 1dp inset reflection at 1.5dp fades from white 32% (primary), 14%/16% (danger light/dark), or the secondary rim to transparent halfway down, then the lower shade. Primary lower rim is `#353B70`; danger retains its red edge.

Variant 2 / Grey in light mode uses a brighter, nearly opaque pale-violet face (`#FAF8FD` at 96%, pressed `#F0ECF6` at 98%) to resist shadow bleed from neighbouring buttons, white 6% sheen, violet `#5059A6` 2.5% lower shade, bright white rim and inset reflection. Dark variant 2 / Grey follows the later charcoal reference: `#1F1E27` at 94%, pressed `#191820` at 98%, with just white 1% at the top and black 2.5% at the bottom. It should read almost flat, with no purple glow. A continuous 1.5dp outer rim runs from `#44434D` at the top to `#35343E` at 45%; a 1dp dark `#0F0E16` inner edge sits 2.5dp inside the outline. Keep its existing soft shadow and light `textPrimary` label. The stronger rim and dark inner separation provide depth without a bright top reflection.

This is a frosted **surface treatment**, not a live backdrop blur: current secondary actions sit on uniform screen/sheet backgrounds. Text is never blurred. If placed over images or moving content in a future feature, add a real background capture/blur rather than blurring the button's content.

Shadows use two layers. Light variant 1 uses 0/1/2dp near + 0/4/16dp wide (−8dp spread), tightened to avoid muddying a secondary action 10dp below. Primary light uses `#343C75` at 12%/18%; danger light uses `#6E0F0F` at the same alphas. Dark variant 1 and both variant 2 themes retain 0/1/2dp near + 0/10/24dp wide (−8dp spread filled, −10dp secondary). Filled dark uses black 40%/60%. Secondary light uses `#26233A` at 5%/18%; dark uses black 12%/20%.

Pressed: darken the fill, fade both shadows, scale to 97% and move down 1dp. No ripple. Preserve spring release, disabled 40% opacity and reduced-motion handling.

| Element                 | Dark                                           | Light                                    |
| ----------------------- | ---------------------------------------------- | ---------------------------------------- |
| Cards                   | No shadow, 1dp top highlight white 3%          | 1dp ring `#26233A` 5% + soft shadow      |
| Legacy status card      | 1dp ring white 7% on white 2.5%                | 1dp ring `#26233A` 6% on white 60%       |
| Selected filter segment | 1dp black shadow, white 6% top highlight       | 1dp shadow `#26233A`                     |
| Round icon button       | No shadow; `surfaceMutedPressed` when pressed  | Same                                     |
| Bottom sheet            | White 5% ring and highlight; soft black shadow | `#26233A` 4% ring; soft `#26233A` shadow |

The `statusCard` color and shape tokens and legacy elevation treatment are retained for reference only. Current no-receipts, needs-attention and load-error content renders directly on the screen background without a card surface, ring or rounded clipping. Existing status padding tokens still define their shared content spacing.

## Motion

- **Press:** progress `p` goes 0→1 with `tween(90ms)` on press and back with `spring(dampingRatio = 0.55f, stiffness = 700f)` on release (the overshoot gives the friendly bounce). Scale = 1 − 0.03·p, translationY = 1dp·p, shadow and fill interpolate with p clamped to 0..1.
- **Filter switch:** selected tab fill expands from 86% width and 90% height with `spring(dampingRatio = 0.6f, stiffness = 240f)`. Only the fill grows and gently overshoots; label geometry and touch targets stay fixed. Clamp selection progress for colors and elevation, keep the surface opaque, and switch immediately with reduced motion.
- **Processing shimmer:** a highlight sweeps across the "Reading receipt…" text and the amount skeleton every 1.8s, linear, infinite. Shimmer colors: text `onAccentContainer` → `accentShimmer` → `onAccentContainer`; skeleton `skeletonBase` → `skeletonShimmer` → `skeletonBase`.
- **Row → detail (nice to have):** shared-element transition from the row thumbnail to the detail photo frame.
- **Status entrance:** 200ms fade and 6dp upward settle, once on appearance.
- **Loading:** `LOADING_DELAY_MILLIS` = 200ms before revealing skeleton masks for initial receipt loading or an icon for retry. Cancel on completion/failure/disposal and restart for each attempt. `LOADING_SPIN_MILLIS` = 1000ms for one linear rotation. Do not show loading for already loaded background refreshes.
- **Retry recovery:** 200ms crossfade of the error screen into the loaded state. Suppress the incoming status-content entrance so recovery animates only once.
- **Reduced motion:** when the animator duration scale is 0, shimmer and the loading arc are static and entrance, recovery, and press transformations are disabled. The loading visibility delay remains 200ms.

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

## Skeletons

Use existing `skeletonBase`/`skeletonShimmer` colours and the 1.8s shimmer. Text masks retain their typography line height and draw at 60% height with 4dp corners. Minimum widths while loading: compact value/heading 52dp, title 144dp, date 196dp, hero 208dp. These are constrained by the existing parent; loaded elements keep their natural measurements. Full-block masks retain thumbnail and photo-frame shapes.

## Pull-to-refresh

`refreshThreshold` is 80dp and `refreshIndicator` is 44dp. The indicator uses the existing `pill` shape, `surface` fill, `accent` arc, `buttonShadowRadius` (2dp), `loadingIcon` (24dp) and `iconStroke` (2dp). It fills through 360° as drag distance reaches the threshold, then spins a 270° arc using `LOADING_SPIN_MILLIS` (1000ms). `REFRESH_MORPH_MILLIS` (240ms) controls the ring-to-warning morph and `REFRESH_FAILURE_MILLIS` (3000ms) holds the attention-coloured failure cue. `REFRESH_MIN_VISIBLE_MILLIS` (200ms) keeps the spinner open from refresh start before success dismissal or failure presentation. Use monotonic elapsed time and delay only the remaining interval; longer requests add no wait and receipt data updates immediately. `refreshEnter` scales 0 → 1.08 → 1 over 180ms (overshoot at 110ms). `refreshExit` scales 1 → 1.08 → 0 over 220ms (anticipation at 70ms), with alpha following the shrinking scale. Both use `REFRESH_BOUNCE_SCALE` (1.08). Dismiss in place before closing the reserved space; never allow a negative scale or a reappearance after zero. Remove animations disables spin and snaps the morph and dismissal; background refreshes never activate this indicator.

Receipt pages use native HorizontalPager distance/velocity settling with no custom drag threshold. Preserve the existing filter selection animation and SegmentTick haptic. Tab navigation snaps when animations are disabled; dragging still tracks the finger.
