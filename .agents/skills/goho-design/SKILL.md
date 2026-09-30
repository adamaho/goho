---
name: goho-design
description: Goho's visual design system and screen specs for the native Android (Jetpack Compose) app. Use this skill whenever you build, change, or review any Goho UI, including the receipts list, receipt details, the Scan button, rows, status pills, colors, typography, spacing, icons or motion, even if the task only says "fix the list". Follow it instead of Material defaults, and build only the features it lists.
---

# Goho design

Design handoff and mockups: September 30, 2026.

Goho is a family receipt-scanning app. The look is **warm, soft and friendly, with financial-app precision**: warm neutrals (charcoal in dark mode, warm off-white in light), one jade accent, generous rounded corners, confident Manrope type with proportional figures, grouped cards, and buttons that press down with a small spring.

Think "Family wallet's warmth and motion, Linear's calm surfaces", never "Material starter template".

## Non-negotiables

1. **Use the tokens.** Every color, text style, shape, spacing value and motion spec comes from `GohoTheme` (see `assets/compose/GohoTheme.kt`). No hard-coded hex values, dp values or `MaterialTheme.typography` styles in screens.
2. **One accent, used on purpose.** Jade (`accent`) marks the primary action, the Scan button, the processing state and "Add" chips. Nothing decorative is jade. Attention states use `attention` orange. There is no blue, yellow or red in the UI.
3. **Use proportional numbers.** Disable tabular figures throughout the app, including amounts, dates, counts and times. Use natural digit widths and zero tracking for metadata and labels; never use a monospaced font.
4. **Missing amounts show "—", never $0.00.** Receipts that failed processing stay in the list, marked "Not processed", and are never hidden.
5. **Processing is inline.** A new receipt appears at the top of the list immediately with a shimmering "Reading receipt…" pill. No blocking screens or hero scanner.
6. **No ripples.** Press feedback is the Goho press: scale to 97%, move down 1dp, shadow drops, fill darkens, spring back on release. Use `indication = null` plus the press modifier. Never a sunken or inset-shadow pressed state.
7. **Rounded, by role.** Thumbnail 8dp; primary and secondary buttons 16dp (not pills); cards, photo frame and FAB 20dp; pills, badges, filter and icon buttons fully round.
8. **No bottom navigation.** The list screen has a floating Scan button at the bottom right.
9. **Light and dark, following the system.** Both palettes share token names (`GohoLightColors`, `GohoDarkColors`). Never branch on theme in screens; the only exceptions are baked into the components (card edges, top highlights). The photo frame and photo viewer are dark in both themes.

## Scope: build only what the app supports

The app currently supports: the receipts list with All and Needs attention filters, inline processing status, scanning from the Scan button, a scan preview with Upload and Cancel, and a read-only details screen for processed receipts with an expandable photo.

**Do not build, stub or add placeholder UI for any of these** (they are not supported yet):

- Search
- Editing receipt details, categories or notes
- Sharing or exporting
- Deleting receipts
- Retaking a photo
- A details screen for receipts that are processing or failed processing (those rows are not tappable)
- Monthly totals, account or settings entry points, overflow menus
- Server connection status indicators

If a task seems to need one of these, stop and ask instead of inventing UI.

## How to work

1. Read `references/tokens.md` and extend the existing app theme with the tokens needed for the requested screen. Use `assets/compose/GohoTheme.kt` as a reference; preserve the app's existing theme integration and bundled font resources.
2. Build the primitives in `references/components.md`. `assets/compose/GohoComponents.kt` is a reference implementation of them; it has not been compiled, so treat it as a strong starting point and fix any API drift against the project's Compose version.
3. Build screens from `references/screens.md`, which has the layout top to bottom with measurements, copy, states and behavior.
4. Compare against the mockups listed in `assets/mockups/README.md`. The written spec wins if they disagree.
5. Verify the requested behavior against the current Goho server and Android flow before implementing it. Mockups do not establish backend support.

## Approved receipt-list refinements

Preserve these refinements when adapting the reference code or older mockups:

- Title the list “Receipts”. Keep smaller, separate filter tabs below the title in a fixed header (selected pill, no enclosing track), with no scroll-driven resizing or movement. Keep 44dp filter tap targets, both counts, a 12dp gap below the header, and the 12dp top fade.
- Sort each receipt day newest upload first, including successfully processed uploads. Rows without upload timestamps follow in stable server order; do not invent a timestamp for manual receipts.
- Keep receipt rows fully visible at the bottom; do not add a gradient behind the Scan button.
- Use a neutral receipt icon for missing photos, a jade scanning receipt for processing, and an orange receipt with an attention mark for failures. These placeholders do not imply a new server field or image endpoint.
- Center the visible text bounds inside status pills and filter count badges, rather than the font line box. Keep a minimum height that can grow for larger text.

## Definition of done

- Every screen state in `screens.md` renders in both light and dark: processing, not processed, processed, foreign currency, filtered, empty.
- Nothing from the out-of-scope list above appears anywhere.
- No Material ripple appears anywhere in Goho screens.
- Text contrast is at least 4.5:1 (the token pairs already meet this; don't put tertiary text on `surfaceMuted` or `segmentSelected` in dark, or on `surfaceMuted` in light).
- All touch targets are at least 44dp; icon-only buttons have content descriptions.
- Animations stop or become static when the system "Remove animations" setting is on.
- Edge-to-edge: content respects status bar and navigation bar insets.
