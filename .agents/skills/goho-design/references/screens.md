# Goho screens

Three screens plus a minimal photo viewer. Widths assume a 412dp-wide phone; everything is fluid horizontally. Copy is final unless marked provisional. Anything not described here is out of scope (see "Scope" in `SKILL.md`).

## 1. Receipts (list)

**Header** (status bar inset + 4dp top, `screenMargin` sides)

- Title “Receipts” (`screenTitle`, `textPrimary`), inset 4dp, in a 44dp row.
- Keep compact filter tabs below the title: “All {count}” and “Needs attention {badge}”. Only the selected tab has a pill surface; there is no enclosing track. Keep the header fixed while the list scrolls, without moving or resizing the filters. Needs attention shows receipts in the Not processed state.

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
- 8dp below: amount in `display`, always two decimals. Foreign currency: prefix "US$" at 28sp in `textTertiary`, 2dp gap, then the number. Missing amount: "—" in `textTertiary`.
- 8dp below: full date (`meta`, `textTertiary`), for example "Thursday, September 24, 2026".

**Photo** (20 below, `screenMargin` sides): PhotoFrame, 200 tall. Tap the loaded photo area to open the viewer; no separate expand button. Expose “View receipt photo” to accessibility. Loading and missing photos are not tappable.

**Items** (24 below the photo; only when the receipt has line items):

- Header inset to `textInset`: "Items" (`section`, `textTertiary`), with no item count. 8dp below it, the ItemsCard.
- Items appear in receipt order.

**Details** (24 below Items, or below the photo when there are no items): section label "Details", then a read-only DetailList:

- Merchant, Date ("Sep 24, 2026"), Category when present, Subtotal, Tax, and Currency only when it differs from the home currency (for example "US dollar"). Preserve Subtotal and Tax here as requested. Total appears in the hero and at the bottom of Items; when there are no items, put Total after Tax in Details instead.

The screen scrolls; with items it is usually taller than one screen (about 980dp for the four-item example).

No footer and no actions on this screen.

## 3. Photo viewer

Opened by tapping the photo area on the details screen. Mockups: `photo-viewer.png`, `viewer-zoomed.png`, `viewer-controls-hidden.png`, `viewer-swipe-to-close.png`, `viewer-landscape.png`.

**Look**

- Always dark, in light mode too: wrap the screen in `GohoTheme(darkTheme = true)`.
- Full screen, edge to edge, background `photoWellEdge`. The photo is drawn with `ContentScale.Fit`, centered, with no frame or rounded corners.
- One control: a close button (GohoPhotoControlButton with `Icons.Rounded.Close`, content description "Close photo") at the top left, 16dp from the left edge and 4dp below the status bar inset.
- System bars: transparent with light icons.
- The photo's content description is "Receipt photo, {merchant}" (or "Receipt photo" when there's no merchant).

**Zoom and pan**

- Scale range: 1× (fit) to 4×. Pinch past 4× resists slightly and settles back to 4×; pinch below 1× settles back to fit with a spring (`dampingRatio = 0.8f`, `stiffness = 400f`).
- Double-tap: at fit, animates to 2.5× centered on the tap point; when zoomed, animates back to fit. 300ms, `FastOutSlowInEasing`.
- Pan only when zoomed. The photo's edges can't be dragged inside the screen edges; at the edge, a horizontal fling stops rather than bouncing.
- Zooming always shows the close button again.

**Tap to hide controls**

- A single tap on the photo toggles the close button and the system bars together (fade 200ms). Wait for the double-tap timeout before treating a tap as a single tap so double-tap doesn't flash the controls.
- When hidden, the close button stays reachable by TalkBack (keep it in the semantics tree; only its alpha changes), and the back gesture still closes the viewer.

**Swipe down to close** (only at fit)

- Dragging vertically moves the photo with the finger and scales it down to a minimum of 0.86 at 300dp of drag. The background alpha fades from 100% toward 55% so the details screen shows through. Controls hide while dragging.
- Release past 120dp, or with a downward fling faster than 1,000dp/s: close. Otherwise spring back (`dampingRatio = 0.8f`).
- When zoomed in, vertical drags pan instead.

**Open and close transition**

- Preferred: a shared-element transition (`SharedTransitionLayout` with `sharedElement` on the photo) from the photo in the details screen's PhotoFrame to the full-screen photo, about 300ms, with the background fading in. Closing reverses it.
- Acceptable fallback if shared elements are impractical: fade plus scale from 0.96, 220ms.

**Rotation**

- Keep the app portrait-only, including this viewer, as requested. Preserve the landscape mockup as a reference only; do not enable rotation to match it.

## 4. Scan preview

Shown after the ML Kit document scanner returns a capture. Replaces the current centered "Goho" layout.

**Header** (status bar inset + 4dp top, `screenMargin` sides, 44 tall): "New receipt" (`screenTitle`, `textPrimary`) inset 4dp on the left. Nothing else in the header; no server status.

**Photo** (12 below the header, `screenMargin` sides): PhotoFrame without the expand button, filling the available space above the footer. The capture is drawn with `ContentScale.Fit`, centered, with a soft drop shadow. Same dark well in both themes.

**Status line:** show upload progress or an upload failure only. The ready state has no status line or warning about the receipt not being uploaded. This approved refinement supersedes the status line in the supplied mockups.

**Footer** (no background, padding 16 top, `screenMargin` sides, 28 + nav inset bottom), stacked with a 10dp gap:

- GohoPrimaryButton "Upload receipt" with an upload icon. Keeps its current behavior.
- GohoSecondaryButton "Cancel", no icon. Discards the capture and returns to the Receipts list. System back does the same.

While an upload is in progress, keep the existing behavior; if the button needs a busy state, show the label "Uploading…" with the button disabled rather than adding new UI.
