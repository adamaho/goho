# Goho screens

Three screens, a photo viewer, the receipt options sheet, and the list's empty and error states. Widths assume a 412dp-wide phone; everything is fluid horizontally. Copy is final unless marked provisional. Anything not described here is out of scope (see "Scope" in `SKILL.md`).

List and details receipt options and deletion use the same supported server endpoints. Verify server support before implementing new behavior.

## 1. Receipts (list)

**Header** (status bar inset + 4dp top, `screenMargin` sides)

- Decorative Bram mark (`bram-mark.png`), 40×40dp, then a 10dp gap and title “Receipts” (`screenTitle`, `textPrimary`), inset 4dp, in a row at least 44dp tall. Hide the mark for a load error.
- Keep compact filter tabs below the title: “All {count}” and “Needs attention {badge}”. Only the selected tab has a pill surface; there is no enclosing track. Keep the header fixed while the list scrolls, without moving or resizing the filters. Needs attention shows receipts in the Not processed state.

**List**

- Sections in reverse chronological order: "Today", "Yesterday", "Earlier this week", "Last week", then month names ("August", "July 2025" once the year differs). Each section is a label plus a ReceiptCard, 24dp above each label.
- Row date labels: today → "Today, 8:14 AM"; processing and under a minute old → "Just now"; otherwise "Sun, Sep 27" (locale-aware skeleton `EEEMMMd`).
- A new scan is inserted at the top of Today immediately in the Processing state, then changes in place to Processed or Not processed.
- Processed rows open Receipt details. Not processed rows open the receipt options sheet (see "Deleting from the list" below). Processing rows aren't tappable.
- Press and hold on any Processed or Not processed row also opens the receipt options sheet for that receipt. Processing rows ignore it.
- Leave bottom padding in the list so the last row can scroll clear of the Scan button.

**Scan FAB** bottom right, with no bottom gradient over the list. Opens the existing scan flow.

**Deleting from the list** (mockups `list-hold-press*.png`, `list-tap-not-processed*.png`, `list-after-delete*.png`, plus the sheet mockups in section 5)
Two ways in, one sheet: press and hold any Processed or Not processed row, or tap a Not processed row. Both open the Receipt options sheet described in section 5. On success the sheet drops away and you stay on the list: the row folds out (height and fade, 250ms), dividers close up, the "All" count drops and the Needs attention badge updates (hidden at 0). If that leaves a section empty, the section label goes too. If the Needs attention filter is active and nothing is left, show its empty state.

**Empty and error states**: see section 6.

## 2. Receipt details (processed receipts only)

**Top bar** (status bar inset, 56 tall, `screenMargin` sides): round back button on the left, round overflow button (`MoreHoriz`, content description "More options") on the right. No title.

**Hero** (12 below the bar, `textInset` sides)

- Merchant (`rowTitle` in `textSecondary`).
- 8dp below: amount in `display`, always two decimals. Show the symbol and number in `display`, followed by the currency code at 20sp in `textTertiary` on the same baseline. Missing amount: "—" in `textTertiary`.
- 8dp below: full date (`meta`, `textTertiary`), for example "Thursday, September 24, 2026".

**Photo** (uploaded receipts only; 20 below, `screenMargin` sides): PhotoFrame, 200 tall. Omit the whole section for receipts without an upload. Tap the loaded photo area to open the viewer; no separate expand button. Expose “View receipt photo” to accessibility. Loading and missing photos are not tappable.

**Items** (24 below the photo; only when the receipt has line items):

- Header inset to `textInset`: "Items" (`section`, `textTertiary`), with no item count. 8dp below it, the ItemsCard.
- Items appear in receipt order.

**Details** (24 below Items, or below the photo when there are no items): section label "Details", then a read-only DetailList:

- Merchant, Date ("Sep 24, 2026"), Category when present, Subtotal and Tax. Omit the separate Currency row, since the hero total already includes its currency code. Preserve Subtotal and Tax here as requested. Total appears in the hero and at the bottom of Items; when there are no items, put Total after Tax in Details instead.

The screen scrolls; with items it is usually taller than one screen (about 980dp for the four-item example).

No footer on this screen.

**Deleting a receipt** (the overflow button is in `receipt-details*.png`)
The overflow button opens the Receipt options sheet (section 5). On success the sheet drops away, then the details screen leaves with the normal back transition, and on the list the receipt's row folds out as described in section 1.

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

## 5. Receipt options sheet and delete confirmation

One GohoSheet, opened from the details screen's overflow button, by pressing and holding a list row, or by tapping a Not processed row. Mockups: `sheet-menu-*.png` and `sheet-confirm-*.png` (from the list, from details, not processed; dark and `-light`), motion storyboards `motion-1` to `motion-5`.

**Receipt header** (identical in both states; it never moves or changes)

- A row, 18dp below the grabber, 20dp side padding, 14dp gap, vertically centered.
- Photo: 56×68, 10dp corners, the receipt photo cropped to fill (the same image as the list thumbnail and details photo), 1dp `outline` border.
- Store name: 18/24 SemiBold, −1.5%, `textPrimary`, one line with ellipsis. Not processed: "Unknown receipt" (or the merchant if one was read).
- 3dp below: the price in 15/20 Medium, proportional figures, two decimals (currency symbol with no trailing code), then two spaces and the full date ("Sun, Sep 27, 2026") in 15/20 Regular `textTertiary`. Not processed: the "Not processed" pill, an 8dp gap, then the date or time ("Today, 8:14 AM").

**Menu state** (traditional list items)

- 18dp below the header: a `divider`, inset 20dp on both sides.
- Then a list with 6dp top and 8dp bottom padding. Each item: 56dp tall, 20dp side padding, 16dp gap, a 22dp leading icon, label 16sp Medium. Today there's one item: "Delete receipt" with the trash icon, both in `onDangerContainer`. Pressed: `surfacePressed` (light) / `surfaceMutedPressed` (dark), no ripple. Use `menu` / `menuitem` semantics.

**Confirmation state** (same sheet; never a second sheet)

- 18dp below the header, with 20dp side padding: GohoDangerButton "Delete receipt" (no icon), then GohoSecondaryButton "Cancel", 10dp apart, 20dp bottom padding. Omit the confirmation heading and description, including where supplied mockups show them.
- Announce the pane as "Delete receipt"; keyboard focus moves to Cancel when confirmation opens.

**Behavior**

- Cancel, the scrim, drag-down or back closes the sheet without deleting.
- Confirming: the Delete button shows "Deleting…" and is disabled, and the sheet can't be dismissed. On failure, keep the sheet open, add "Couldn’t delete this receipt. Try again." above the buttons (`body`, `onDangerContainer`, 18dp gap below the error), and re-enable the buttons.

**Motion** (photos never move; everything animates inside the sheet)

- Opening: the sheet slides up while the scrim fades in. Keep the header and menu content together; do not stagger individual elements. Use the same opening behavior from the list and details.
- Menu → confirmation (about 280ms): keep the same mounted receipt header in the same position within the sheet. The divider and menu item fade out while the sheet height changes smoothly. Reveal the buttons together, without stagger or bounce. The current layout has no large confirmation icon or moving trash icon.
- Delete succeeded: the sheet slides down (200ms, `FastOutLinearInEasing`) and the scrim fades. From the list, the row then folds out (250ms). From details, the details screen goes back with the normal back transition, then the row folds out on the list.
- Cancel: the sheet slides down; nothing else changes.
- With "Remove animations" on: no stagger or springs; the sheet and its contents crossfade, and the row disappears without folding.

## 6. Empty and error states

Mockups: `empty-needs-attention*.png`, `empty-no-receipts*.png`, `load-error*.png` (dark and `-light`). All three use the StatusCard (components.md). Render the current lavender Bram PNGs unchanged; the no-receipts state shares one transparent asset across both themes, while the other states retain light/dark variants. Older SVG illustrations are historical.

**Layout and transitions**

- Center the card in the available content area below the fixed header and above a separate Scan footer when present, respecting system insets. Give the scrollable content 16dp horizontal and vertical padding. On short screens or with larger text, allow the whole card to scroll rather than clipping copy or overlapping Scan.
- Animate a newly shown card once: 200ms fade and 6dp upward settle. No looping or bouncing mascot animation.
- During retry, keep the error header and card mounted. Reserve button space for both labels at the current font scale; show disabled “Trying again…” without changing bounds. Failure restores “Try again” in place. Success crossfades the outgoing error screen to the loaded state in 200ms, with no second card entrance and no outgoing accessibility actions.
- With Remove animations enabled, entrance, recovery, and press are static. Keep existing copy unchanged.

**Needs attention, nothing in it**

- Header includes Bram and filters ("Needs attention" selected, no badge). Preserve both filters after deleting the last failed receipt, even when the overall count is zero. The Scan button stays.
- StatusCard centered vertically in the space between the filter and the Scan button. Illustration `status-needs-attention`: Bram beneath two receipts, a lavender check badge, and a sparkle chip (“all sorted”).
- Title "Nothing needs attention"; text "Receipts that couldn’t be processed will show up here." No button.

**No receipts yet** (the account has no receipts at all)

- Header shows Bram and the “Receipts” title (no filter). The Scan button stays.
- StatusCard centered between the header and Scan footer. Illustration `status-no-receipts`: Bram gently cradles a small blank cream receipt in front of his lower belly, with a welcoming smile. Preserve his broad lilac body, long rounded arms, small ivory horns and tiny feet. The single transparent PNG serves both themes; there is no separate floating receipt, plus badge or typing indicator.
- Title "No receipts yet"; text "Tap Scan to add your first one." No button.

**Couldn’t load receipts** (the list request failed)

- Header shows only the “Receipts” title. No Bram header mark, filter, or Scan button.
- StatusCard centered in the available area below the header. Illustration `status-load-error`: Bram beneath a cloud and a peach wifi-off chip (“couldn’t reach the server”).
- Title "Couldn’t load receipts"; text "Check your connection and try again."; full-width GohoPrimaryButton "Try again" 22dp below the text. While retrying, the button shows "Trying again…" and is disabled.
- Announce the card as a polite live region when it appears.
