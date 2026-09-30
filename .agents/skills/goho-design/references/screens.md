# Goho screens

Two screens plus a minimal photo viewer. Widths assume a 412dp-wide phone; everything is fluid horizontally. Copy is final unless marked provisional. Anything not described here is out of scope (see "Scope" in `SKILL.md`).

## 1. Receipts (list)

**Header** (status bar inset + 4dp top, `screenMargin` sides)

- Wordmark "goho" (`wordmark`, `textPrimary`), inset 4dp, in a 44-tall row. Nothing else in the header.
- **Segmented filter** 16dp below: "All {count}" and "Needs attention {badge}". Needs attention shows receipts in the Not processed state.

**List**

- Sections in reverse chronological order: "Today", "Yesterday", "Earlier this week", "Last week", then month names ("August", "July 2025" once the year differs). Each section is a label plus a ReceiptCard, 24dp above each label.
- Row date labels: today → "Today, 8:14 AM"; processing and under a minute old → "Just now"; otherwise "Sun, Sep 27" (locale-aware skeleton `EEEMMMd`).
- A new scan is inserted at the top of Today immediately in the Processing state, then changes in place to Processed or Not processed.
- Only Processed rows are tappable; they open Receipt details.
- Leave bottom padding in the list so the last row can scroll clear of the Scan button.

**Scan FAB** bottom right over the bottom scrim. Opens the existing scan flow.

**Empty states** (provisional; keep them plain):

- No receipts: centered in the list area, "No receipts yet" (`rowTitle`) and "Tap Scan to add your first one." (`meta`, `textTertiary`). Filter hidden.
- Needs attention with none: "Nothing needs attention" (`meta`, `textTertiary`), centered in the list area.

## 2. Receipt details (processed receipts only)

**Top bar** (status bar inset, 56 tall, `screenMargin` sides): round back button on the left. No title, no other actions.

**Hero** (12 below the bar, `textInset` sides)

- Merchant (`rowTitle` in `textSecondary`).
- 8dp below: amount in `display`. Foreign currency: prefix "US$" at 28sp in `textTertiary`, 2dp gap, then the number. Missing amount: "—" in `textTertiary`.
- 8dp below: full date (`meta`, `textTertiary`), for example "Thursday, September 24, 2026".

**Photo** (20 below, `screenMargin` sides): PhotoFrame, 200 tall. Expand opens the photo viewer.

**Details** (24 below): section label "Details", then a read-only DetailList:

- Merchant, Date ("Sep 24, 2026"), Total (with the currency prefix when foreign), and Currency only when it differs from the home currency (for example "US dollar").

No footer and no actions on this screen.

## 3. Photo viewer

Always dark, in both themes (wrap it in `GohoTheme(darkTheme = true)`). Full screen, `photoWellEdge` background, photo fitted, pinch to zoom and pan, round close button (GohoIconButton with `Close`) at the top left below the status bar. Back gesture closes it.
