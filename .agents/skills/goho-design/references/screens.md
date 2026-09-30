# Goho screens

Three screens plus a minimal photo viewer. Widths assume a 412dp-wide phone; everything is fluid horizontally. Copy is final unless marked provisional. Anything not described here is out of scope (see "Scope" in `SKILL.md`).

## 1. Receipts (list)

**Header** (status bar inset + 4dp top, `screenMargin` sides)

- Wordmark "goho" (`wordmark`, `textPrimary`), inset 4dp, in a 44-tall row. At the top of the list, the filter sits below this row.
- **Segmented filter** 16dp below at the top of the list: "All {count}" and "Needs attention {badge}". On upward scroll, move it beside the wordmark and compact it to "All {count}" and "Attention {badge}"; keep its full accessible names. Restore the expanded header when scrolling back to the top. Needs attention shows receipts in the Not processed state.

**List**

- Sections in reverse chronological order: "Today", "Yesterday", "Earlier this week", "Last week", then month names ("August", "July 2025" once the year differs). Each section is a label plus a ReceiptCard, 24dp above each label.
- Row date labels: today → "Today, 8:14 AM"; processing and under a minute old → "Just now"; otherwise "Sun, Sep 27" (locale-aware skeleton `EEEMMMd`).
- A new scan is inserted at the top of Today immediately in the Processing state, then changes in place to Processed or Not processed.
- Only Processed rows are tappable; they open Receipt details.
- Leave bottom padding in the list so the last row can scroll clear of the Scan button.

**Scan FAB** bottom right, with no bottom gradient over the list. Opens the existing scan flow.

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

## 4. Scan preview

Shown after the ML Kit document scanner returns a capture. Replaces the current centered "Goho" layout.

**Header** (status bar inset + 4dp top, `screenMargin` sides, 44 tall): "New receipt" (`title`, `textPrimary`) inset 4dp on the left. Nothing else in the header; no server status.

**Photo** (12 below the header, `screenMargin` sides): PhotoFrame without the expand button, filling the available space above the footer. The capture is drawn with `ContentScale.Fit`, centered, with a soft drop shadow. Same dark well in both themes.

**Status line:** show upload progress or an upload failure only. The ready state has no status line or warning about the receipt not being uploaded. This approved refinement supersedes the status line in the supplied mockups.

**Footer** (no background, padding 16 top, `screenMargin` sides, 28 + nav inset bottom), stacked with a 10dp gap:

- GohoPrimaryButton "Upload receipt" with an upload icon. Keeps its current behavior.
- GohoSecondaryButton "Cancel", no icon. Discards the capture and returns to the Receipts list. System back does the same.

While an upload is in progress, keep the existing behavior; if the button needs a busy state, show the label "Uploading…" with the button disabled rather than adding new UI.
