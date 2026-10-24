# Goho screens

All standard actions and the Add button use the October 14 glossy deep-periwinkle / frosted-secondary finishes in `tokens.md`. The native app implements SectionTitle with its anchored menu, switching between Receipts and a Books list (section 8) whose saved books open the book overlay (section 9) with Delete book on tap and the book options sheet (section 5) on a hold, and Add with Scan receipt and Scan book through the shared scan preview (section 4). Title swiping and further Books screens remain future design targets.

Three screens, a photo viewer, section navigation and the Add button (section 7), the Books list (section 8), the receipt and book options sheet, and the list's empty and error states. Widths assume a 412dp-wide phone; everything is fluid horizontally. Copy is final unless marked provisional. Anything not described here is out of scope (see "Scope" in `SKILL.md`).

List and details receipt options and deletion use the same supported server endpoints. Verify server support before implementing new behavior.

## 1. Receipts (list)

**Header** (status bar inset + 4dp top, `screenMargin` sides)

- Title “Receipts” (`screenTitle`, `textPrimary`) at the 20dp text inset (4dp inside the screen margin), in a row at least 44dp tall, rendered as the shared `SectionTitle` with its chevron (section 7). The header is text-only in every state, with no Bram mark.
- Keep compact filter tabs below the title: “All {count}” and “Needs attention {badge}”. Only the selected tab has a pill surface; there is no enclosing track. Keep the header fixed while the list scrolls, without moving or resizing the filters. Needs attention shows receipts in the Not processed state.

**List**

- Sections in reverse chronological order: "Today", "Yesterday", "Earlier this week", "Last week", then month names ("August", "July 2025" once the year differs). Each section is a label plus a ListCard, 24dp above each label.
- Row date labels: today → "Today, 8:14 AM"; processing and under a minute old → "Just now"; otherwise "Sun, Sep 27" (locale-aware skeleton `EEEMMMd`).
- Processed rows show the top-spend category beneath the price as a labelled `Tag`, plus a Grey `TagCount` (“+N”) when the receipt has other categories (see components.md, Category tags). Processing and Not processed rows keep their upload tag and show no category. Large-text/narrow layouts stack the right-aligned amount and tags without squeezing the date. Mockups: `category-list-light.png`, `category-list-dark.png`.
- A new scan is inserted at the top of Today immediately in the Processing state, then changes in place to Processed or Not processed. Use `ReceiptUploadTag` for the Purple scan-icon “Reading receipt…” and Orange warning-icon “Not processed” states.
- Processed rows open Receipt details. Not processed rows open the receipt options sheet (see "Deleting from the list" below). Processing rows aren't tappable.
- Press and hold on any Processed or Not processed row also opens the receipt options sheet for that receipt. Processing rows ignore it.
- Leave bottom padding in the list so the last row can scroll clear of the Add button.

**Add button** bottom right, with no bottom gradient over the list. Opens the Add menu; Scan receipt opens the existing scan flow (section 7).

**Deleting from the list** (mockups `list-hold-press*.png`, `list-tap-not-processed*.png`, `list-after-delete*.png`, plus the sheet mockups in section 5)
Two ways in, one sheet: press and hold any Processed or Not processed row, or tap a Not processed row. Both open the Receipt options sheet described in section 5. On success the sheet drops away and you stay on the list: the row folds out (height and fade, 250ms), dividers close up, the "All" count drops and the Needs attention badge updates (hidden at 0). If that leaves a section empty, the section label goes too. If the Needs attention filter is active and nothing is left, show its empty state.

**Empty and error states**: see section 6.

## 2. Receipt details (processed receipts only)

**Top bar** (status bar inset, 56 tall, `screenMargin` sides): variant 2/Grey `IconButton` for back on the left, matching round overflow button (`MoreHoriz`, content description "More options") on the right. No title. Draw the top bar above the scroll body’s header fade so icon shadows soften naturally without a horizontal cutoff beneath the buttons.

**Hero** (12 below the bar, `textInset` sides)

- Merchant (`rowTitle` in `textSecondary`).
- 8dp below: amount in `display`, always two decimals. Show the symbol and number in `display`, followed by the currency code at 20sp in `textTertiary` on the same baseline. Missing amount: "—" in `textTertiary`.
- 8dp below: full date (`meta`, `textTertiary`), for example "Thursday, September 24, 2026".

**Photo** (uploaded receipts only; 20 below, `screenMargin` sides): PhotoFrame, 200 tall. Omit the whole section for receipts without an upload. Tap the loaded photo area to open the viewer; no separate expand button. Expose “View receipt photo” to accessibility. Loading and missing photos are not tappable.

**Categories** (24 below the photo, or below the hero without an upload; only when the receipt has line items, including when every item shares one category):

- Header inset to `textInset`: "Categories" (`section`, `textTertiary`). 8dp below it, the `CategoryBreakdown` card ([component spec](components.md#category-tags)).
- One row per category, sorted by spend, using the same `CategoryIcon` as the item rows so the card is the legend for the item icons. A single-category receipt with a positive total shows one row with a full bar; refund and zero-total receipts retain category amounts but omit bars when they cannot represent a positive whole.
- Approved mockups: [light](../assets/mockups/category-details-light.png) and [dark](../assets/mockups/category-details-dark.png) with two categories, and [single category](../assets/mockups/category-details-single-light.png). Native implementation captures and verification are in the [mockup guide](../assets/mockups/README.md#receipt-category-overview-native-implementation).

**Items** (24 below the Categories card; only when the receipt has line items):

- Header inset to `textInset`: "Items" (`section`, `textTertiary`), with no item count. 8dp below it, the ItemsCard.
- Items appear in receipt order. Item names use one line with an ellipsis for overflow at every font size. Each item row starts with a 24dp icon-only `CategoryIcon` for its category, 12dp before the name; the Total row has no icon. Vertically center the tag, name and amount in the row. Do not group or reorder items by category. Current native item-row captures (before the Categories card): [light](../assets/mockups/category-items-native-light.png) and [dark](../assets/mockups/category-items-native-dark.png); loading and large-text checks are documented in the [mockup guide](../assets/mockups/README.md#receipt-item-category-icons-native-implementation).

**Details** (24 below Items, or below the photo/hero when there are no items): section label "Details", then a read-only DetailList:

- Merchant, Date ("Sep 24, 2026"), Subtotal and Tax. There is no Category row; categories are shown in the Categories card and on each item. Omit the separate Currency row, since the hero total already includes its currency code. Preserve Subtotal and Tax here as requested. Total appears in the hero and at the bottom of Items; when there are no items, put Total after Tax in Details instead.

The screen scrolls; with items it is usually taller than one screen.

No footer on this screen.

**Deleting a receipt** (the overflow button is in `receipt-details*.png`)
The overflow button opens the Receipt options sheet (section 5). On success the sheet drops away, then the details screen leaves with the normal back transition, and on the list the receipt's row folds out as described in section 1.

## 3. Photo viewer

Opened by tapping the photo area on the details screen. Mockups: `photo-viewer.png`, `viewer-zoomed.png`, `viewer-controls-hidden.png`, `viewer-swipe-to-close.png`, `viewer-landscape.png`.

**Look**

- Always dark, in light mode too: wrap the screen in `GohoTheme(darkTheme = true)`.
- Full screen, edge to edge, background `photoWellEdge`. The photo is drawn with `ContentScale.Fit`, centered, with no frame or rounded corners.
- One control: a close button (PhotoControlButton with `Icons.Rounded.Close`, content description "Close photo") at the top left, 16dp from the left edge and 4dp below the status bar inset.
- System bars: transparent with light icons.
- The viewer is the shared `PhotoViewer`; callers supply the description. Receipts use "Receipt photo, {merchant}" (or "Receipt photo" when there's no merchant); book covers use "Book cover, {title}".

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

Shown after the ML Kit document scanner returns a capture, started from the Add menu’s Scan receipt or Scan book on either section. Both use the same single-page, gallery-enabled JPEG scanner and one native layout, `ScanPreviewScreen(kind, …)`; `ScanKind` (Receipt or Book) supplies only the copy below. The activity remembers the chosen kind while the scanner is open, including across activity recreation, and the kind alone chooses the upload endpoint, never the current section.

| Copy              | Receipt                          | Book                           |
| ----------------- | -------------------------------- | ------------------------------ |
| Title             | New receipt                      | New book                       |
| Photo description | Scanned receipt                  | Scanned book cover             |
| Upload action     | Upload receipt                   | Upload                         |
| Uploading tag     | Uploading receipt…               | Uploading cover…               |
| Submitted tag     | Receipt submitted for processing | Cover submitted for processing |

Failure (“Upload failed. Please try again.”, Retry upload), the busy “Uploading…” label and Cancel are shared.

**Header** (status bar inset + 4dp top, `screenMargin` sides, 44 tall): the kind's title (`screenTitle`, `textPrimary`) inset 4dp on the left. Nothing else in the header; no server status.

**Photo** (12 below the header, `screenMargin` sides): PhotoFrame without the expand button, filling the available space above the footer. The capture is drawn with `ContentScale.Fit`, centered, with a soft drop shadow. Same dark well in both themes.

**Status tag:** use `Tag` for the existing upload progress/submitted copy (Purple, scan icon, text shimmer) or upload failure (Orange, warning icon). Keep the polite status announcement. The ready state has no status line or warning about the receipt not being uploaded. This approved refinement supersedes the status line in the supplied mockups.

**Footer** (no background, padding 16 top, `screenMargin` sides, 28 + nav inset bottom), stacked with a 10dp gap:

- ActionButton (`Primary`) "Upload receipt" or "Upload" with an upload icon.
- ActionButton (`Secondary`) "Cancel", no icon. Discards the capture without uploading and returns to the section the scan started from. System back does the same.

**Upload.** Both kinds stream the capture as one multipart `file` part with `image/jpeg`: `receipt.jpg` to `POST /receipt-uploads`, `book.jpg` to `POST /book-uploads`. Only HTTP 202 with an upload that has not failed is accepted; any other response, a malformed body, or a transport or file error keeps the same capture with the failure tag and Retry upload, with no navigation.

After an accepted upload, select the kind's section and return to All at scroll position zero. Reset again when the list includes that upload, then consume the request so later polling, tab changes and back navigation preserve their positions. On Books the accepted scan joins the top of a loaded list at once, before uploads and books refresh, and a listing that began before the acceptance is discarded and reloaded so it can't drop the row. The request is consumed once the scan's row, or the book it saved or matched when processing already finished, is listed. Failed uploads and cancelled scans do not reset scrolling.

While an upload is in progress, keep the existing behavior; if the button needs a busy state, show the label "Uploading…" with the button disabled rather than adding new UI.

## 5. Receipt and book options sheet and delete confirmation

One Sheet, opened from the details screen's overflow button, by pressing and holding a list row, or by tapping a Not processed receipt row. Book scan rows, including Not processed ones, stay display-only. Mockups: `sheet-menu-*.png` and `sheet-confirm-*.png` (from the list, from details, not processed; dark and `-light`), motion storyboards `motion-1` to `motion-5`.

**Book options** (native): pressing and holding a saved Books row opens the same sheet for that book (section 8). The header is the row’s `BookSummary`: the 48×56dp cover, title, author with optional reading level and the bottom-end category tag 16dp past the text, stacked like the row at font scale ≥1.3 or narrow widths. It draws a plain cover that never joins the book overlay’s cover flight. Copy: pane “Book options”, then “Delete book”, “Deleting…”, “Couldn’t delete this book. Try again.” and “Cancel”. Layout, behavior, locking and motion follow the receipt sheet below. Confirming sends one `DELETE /books/{bookId}` for the held book’s snapshot; only 204 counts as success, and its row then folds out (section 8). Cancel, Back, scrim and drag-down keep the book, and focus returns to its row. Page swipes and pull-to-refresh are disabled while the sheet is open. Queued, processing and failed scans have no hold.

**Receipt header** (the shared list-row content, retained in both states)

- Reuse `ReceiptSummary` rather than a separate sheet-header layout. The list wrapper supplies gestures and row padding; the sheet header is display-only.
- Place it 18dp below the grabber with 20dp side padding. The content uses the list's 12dp thumbnail gap, 5dp line gap and standard typography.
- Thumbnail: the same 40×48dp photo or receipt placeholder with 8dp corners and a 1dp outline.
- First line: merchant on the left, amount and smaller currency code on the right (`rowTitle`, 16/22 Medium; code 12/16). Second line: the shared date/time formatting on the left (`meta`, 13/18), upload-status tag below the amount on the right when present; processed receipts show the same top-spend category `Tag` and `TagCount` as the list row.
- Use the same icon, colour, label wrapping and 160dp tag maximum as the list.
- At narrow widths or font scale ≥1.3, use the same stacked layout as the list: merchant, right-aligned amount/tag, then date. The sheet can grow and scroll.
- Keep the summary mounted through menu, confirmation, deleting and failure states, whether opened from the list or Details.

**Menu state** (traditional list items)

- 18dp below the header: a `divider`, inset 20dp on both sides.
- Then a list with 6dp top and 8dp bottom padding. Each item: 56dp tall, 20dp side padding, 16dp gap, a 22dp leading icon, label 16sp Medium. Today there's one item: "Delete receipt" with the trash icon, both in `onDangerContainer`. Pressed: `surfacePressed` (light) / `surfaceMutedPressed` (dark), no ripple. Use `menu` / `menuitem` semantics.

**Confirmation state** (same sheet; never a second sheet)

- 18dp below the header, with 20dp side padding: ActionButton (`Destructive`) "Delete receipt" (no icon), then ActionButton (`Secondary`) "Cancel", 10dp apart, 20dp bottom padding. Omit the confirmation heading and description, including where supplied mockups show them.
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

## 6. Loading, empty and error states

Mockups: `empty-needs-attention*.png`, `empty-no-receipts*.png`, `load-error*.png` (dark and `-light`). All three use the shared status content layout (components.md), directly on the screen background without an enclosing card fill, border or rounded clipping. No receipts, empty Needs attention and load error each share one transparent Bram asset across both themes. Render each unchanged in the shared 220×190dp slot, with a 4dp gap before the title. The Receipts header is text-only in every state. Load error includes the retry action. Dedicated character artwork for other states is deferred until its feature is implemented. Older SVG illustrations are historical.

**Layout and transitions**

- Center the status content in the available content area below the fixed header and above the persistent Add button, respecting system insets. Give the scrollable content 16dp horizontal and vertical padding. On short screens or with larger text, allow the whole status content to scroll rather than clipping copy or overlapping the Add button.
- Animate newly shown status content once: 200ms fade and 6dp upward settle. No looping or bouncing mascot animation.
- During retry, keep the error header and status content mounted. Disable the button immediately and keep “Try again” visible for the first 200ms. If the request is still pending, replace the label with a centered 18dp loading icon in `onButtonPrimary`, retaining “Trying again…” and indeterminate progress for accessibility. Reserve button space for both labels at the current font scale, including 2× text. Failure restores “Try again” in place. Success crossfades the outgoing error screen to the loaded state in 200ms, with no second status entrance and no outgoing accessibility actions.
- Loading visibility follows the actual pending request, independently of the outgoing recovery screen’s disabled button. Cancel the delay/icon on completion, failure or disposal; every attempt starts a fresh 200ms delay.
- With Remove animations enabled, entrance, recovery, and press are static. Loading uses a static arc after the same 200ms delay. Keep existing copy unchanged.

**Initial receipts loading**

- Reuse the existing section heading, ListCard, four ReceiptRows, thumbnails and text. Pass absent data while loading; do not create fake receipt models or duplicate the row layout.
- Wrap the group in `SkeletonScope` and apply `Modifier.skeleton` to the existing text and image elements. After 200ms, render skeletonBase/skeletonShimmer masks; preserve measured typography, row padding and large-text stacking. Keep the Receipts header and Scan available.
- Expose one “Loading receipts…” polite live region with indeterminate progress. Placeholder descendants have no text or click semantics. Do not replace loaded content during background refreshes. Preserve the existing error/retry flow.

**Receipt detail loading**

- Keep the same LazyColumn, hero, photo frame, item card and detail rows. Mask their existing elements; use three absent item rows until receipt data arrives. Back remains available; hide the more menu until loaded.
- Text masks occupy 60% of their measured line height, with 4dp corners. Photo and thumbnail masks fill their clipped bounds. Omit the photo section when the receipt is known to have no upload; separately mask an uploaded photo while it loads.
- Expose “Loading receipt…” once as polite indeterminate progress. Conceal all placeholder semantics, including item names and money; do not make loading photos tappable. After loading, restore real content and actions. Failure replaces the masks with the existing retry state.
- Use static masks when Remove animations is enabled. Both layouts must remain scrollable at 2× font size. Compose previews show masks immediately.
- Current references: `initial-loading-light.png`, `initial-loading-dark.png`, `receipt-detail-loading-light.png`, `receipt-detail-loading-dark.png`, and the large-text captures listed in the mockup README.

**Needs attention, nothing in it**

- Header includes the “Receipts” title and filters ("Needs attention" selected, no badge). Preserve both filters after deleting the last failed receipt, even when the overall count is zero. The Add button stays.
- Bram and the copy are centered vertically between the filter and the Add button, directly on the screen background. Illustration `status-needs-attention`: Bram gives a calm thumbs-up with a soft smile, using his familiar lilac and cream palette and rounded arms. Keep the approved pose without confetti, streamers or extra decorative colors. The single transparent PNG serves both themes, in the shared 220×190dp illustration slot.
- Title "All good"; text "Nothing needs your attention right now." No button.

**No receipts yet** (the account has no receipts at all)

- Header shows the “Receipts” title and both page tabs, including All 0. The shared Add button stays.
- Bram and the copy are centered between the header and the Add button, directly on the plain screen background. Omit card fill, border and rounded clipping. Preserve the shared status content padding and illustration size, with a 4dp gap before the title. Illustration `status-no-receipts`: Bram gently cradles a small blank cream receipt in front of his lower belly, with a welcoming smile. Preserve his broad lilac body, long rounded arms, small ivory horns and tiny feet. The single transparent PNG serves both themes; there is no separate floating receipt, plus badge or typing indicator.
- Title "No receipts yet"; text "Tap + to scan your first one." No button.

**A little hiccup** (the list request failed)

- Header shows only the “Receipts” title, with no filters. The shared Add button stays available because scanning does not require the server.
- Bram, copy and retry action are centered in the available area below the header, directly on the screen background. Illustration `status-load-error`: Bram gives a gentle shrug with his original rounded arms, without thumbs. Preserve the approved lilac and cream artwork unchanged in both themes, using the shared 220×190dp slot and 4dp title gap.
- Title "A little hiccup"; text "We couldn’t load your receipts. Let’s try again."; full-width ActionButton (`Primary`) "Try again" 22dp below the text. While retrying, the button is disabled with stable bounds: keep "Try again" during the 200ms grace period, then show the loading icon while the request remains pending, with "Trying again…" exposed to accessibility.
- Announce the status content as a polite live region when it appears.

## Pull-to-refresh on the receipts list

Keep the loading arc rotating continuously through the 200ms minimum and the entire bounce-to-zero exit. Stop only when it is invisible or changes to the warning triangle; honour Remove animations.

- Use Compose nested-scroll pull-to-refresh around the content below the fixed header. The gesture works at the top of a populated list, the no-receipts state, and the empty Needs attention filter. A short pull cancels; releasing beyond 80dp triggers one refresh of both receipt and upload lists.
- Preserve the selected filter and mounted rows while refreshing. Do not replace existing content with skeletons or move the header and the Add button. Loading an initial list continues to use skeletons, while automatic polling stays quiet.
- Reserve space below the header as the user pulls, so the 44dp indicator never covers a receipt row. The lavender arc fills to a complete 360° ring at the 80dp threshold and gives one GestureThresholdActivate haptic per pull, even if the finger moves back and forth across the threshold. On release, keep the indicator in that space and rotate a 270° arc once per second for the whole request. Keep the spinning indicator visible for at least 200ms from refresh start, then give it a small 108% anticipation bounce and shrink it to zero in place over 220ms, fading as it shrinks. On appearance, scale from zero through 108% to 100% over 180ms. Keep the reserved space until the indicator is invisible, then settle the list; never slide a completed indicator upward. Cancelled, below-threshold pulls still retract with the finger. Requests longer than 200ms add no extra wait. Apply the same minimum before showing a failure; update receipt data immediately. On failure, morph the ring into an attention-orange outlined warning triangle with an exclamation mark over 240ms; hold it for three seconds before the same bounce-to-zero dismissal. Keep the Add button anchored as the content area changes height. Disable spin and snap the morph and dismissal when animations are disabled. Use the existing surface, accent/attention, pill shape and soft 2dp shadow tokens.
- Do not start another request while a refresh is running. An explicit refresh can join an in-flight request; retain the existing deletion-revision guard so stale responses cannot restore deleted rows.
- On failure after a successful load, keep cached receipts and filter state. The indicator's orange warning triangle is the only failure cue: no inline notice or Try again button (removed October 23, 2026 at the user's request). Pull again to retry. Initial load failures retain the existing full error state.
- Expose a “Refresh receipts” accessibility action on the content region and a single “Refreshing receipts…” indeterminate progress announcement on the indicator. The gesture cue changes from “Pull to refresh” to “Release to refresh”. Failure replaces the progress semantics with a polite “Refresh failed” announcement.
- Review captures: `pull-refresh-light.png`, `pull-refresh-empty-dark.png`, `pull-refresh-error-light.png`, and `pull-refresh-large-text.png` in `assets/mockups/`.

## Horizontal receipt pages

All and Needs attention share one receipt data source and row layout, presented as two pages in a Compose HorizontalPager. Books uses the same pages through the shared `FilterPager`; everything below applies to both sections. Swipe left to reveal Needs attention and right to reveal All. Content tracks the finger throughout the drag, with both pages visible halfway; use the native distance/velocity settling behaviour and never wrap at the ends. Keep the adjacent page composed so its content is ready before the swipe finishes. Keep a separate vertical list and status scroll position on each page rather than resetting on tab changes.

Keep the header and one Add button mounted outside the pager. Anchor the Add button 24dp from the end edge and 28dp above the window’s bottom safe area in every state, including the first cold-start frame; ignore outgoing keyboard insets on this screen and respect system bars and display cutouts. Both tabs remain available when either or both pages are empty. Tab taps animate the pager (snap with Remove animations); the selected tab follows the nearest page. Retain tab selection haptics and give one SegmentTick when a swipe settles on a different page, without a second haptic for a tab tap. Hide inactive page content from accessibility while retaining the accessible tab controls.

Wrap the pager in the shared pull-to-refresh container so both pages refresh the same data with one indicator. Vertical scrolling, refresh, and receipt taps/holds retain their gestures. Disable page swipes during initial loading, full load errors, manual refresh and open receipt options. Background polling keeps pages interactive. Keep the Add button available across loading, populated, empty and error states, with enough bottom space for list rows and status content to clear it. The Add button only disables while the scanner is opening.

## 7. Section navigation and add button

Approved October 22, 2026. Add, the title menu and switching sections from the menu are implemented, with a Books list (section 8) and the book overlay (section 9). Scan receipt and Scan book open the scanner and shared scan preview (section 4). Title swiping remains planned. Mockups: `nav-title-*.png`, `nav-menu-receipts-*.png`, `nav-menu-books-*.png`, `nav-swipe-halfway-*.png`, `nav-add-closed-*.png`, `nav-add-menu-books-*.png` and `nav-add-menu-receipts-*.png` (light and dark). The list content in them is sample data.

**Section order.** The native `Section` enum orders Receipts (receipt icon, count = All count), then Books (book icon, count = number of saved books, excluding unfinished or failed scans), and drives the menu. The Add stack lists Scan book above Scan receipt so Receipts remains nearest the button. When title swiping arrives, the same order drives the swipe.

**SectionTitle** (replaces the plain list title on every section root)

- Same position and type as the current title: `screenTitle` in `textPrimary` at the 20dp text inset, status bar inset + 4dp, row at least 44dp tall. An 18dp chevron (`textSecondary`, 2dp stroke) follows the name with a 2dp gap, inside a 28dp round slot. The tap target is the whole title row width up to the chevron, at least 44dp tall.
- Filters and everything below are unchanged. The title is not shown on details or scan preview screens.

**SectionMenu** (tap the title)

- Anchored under the title: 4dp below the title row, aligned to the 16dp screen margin, width 240dp (grows for large text, never past the screen margin). Shape `sectionMenu` 20dp, fill `sheet`, 6dp padding, the sheet ring and shadow. A `scrim` at 35% alpha covers the screen behind it; the header stays visible.
- One row per section, 48dp minimum height, 14dp side padding, 14dp corners: 20dp icon, 12dp gap, name in `rowTitle`, count right-aligned in `meta`. Current section: `accentContainer` fill, icon, name and count in `onAccentContainer`. Others: icon `textSecondary`, name `textPrimary`, count `textTertiary`. Omit a count until its data has loaded; never show 0 for unknown.
- **Current native scope:** the current section is selected. Choosing the other section finishes the 120ms menu exit before changing the title and page, without a title roll or content crossfade. The outgoing title, selected menu row and content stay stable throughout the fade; choosing the current section only closes it. Neither choice changes a filter or scroll position or makes a network call; counts appear once each section has loaded. The menu and its scrim fade in over 160ms and out over 120ms, with the popup scaling from 0.96 around its start/top anchor. Composite the popup surface, rows and shadow into one layer so they fade together, with shadow drawing space outside the face and no rectangular shadow remnant. Remove animations snaps both and the chevron. Add and title menus cannot overlap. The modal popup blocks underlying input and hides receipt/Add semantics.
- The chevron turns 180° while open. Choosing the current section just closes the menu. The title swipe (below) will add the roll; menu switches change the title in place. Outside tap, Back or the title closes it.
- Native semantics: the title is a heading/Button named “Section: Receipts” (or Books), with expanded/collapsed state. The popup is a “Sections” pane with selected button rows (the current section retains its dismissal action); focus moves to the current section on open and returns to the title after exit. Next/Previous section actions are deferred with title swiping.

**Title swipe (planned)**

- Vertical drag that starts on the title. Up selects the next section, down the previous; there is no wrap. The outgoing name follows the finger upward (or downward) and fades as the incoming name enters from the opposite side, one title height apart; the section content crossfades with the same progress. Header filters, list scroll and the Add button stay put.
- Commit when released past 24dp or flung faster than 1,000dp/s in the drag direction, finishing over `TITLE_ROLL_MILLIS` (220ms, `FastOutSlowInEasing`), with one `SegmentTick` haptic. Otherwise spring back (`dampingRatio = 0.8f`, `stiffness = 400f`). At the first or last section the title rubber-bands at most 8dp and returns, with no haptic.
- The gesture lives only in the fixed header, so it never competes with pull-to-refresh, the All / Needs attention pager or row gestures. Disable it while the section menu or Add menu is open.

**Switching sections (implemented from the menu)**

- Each section keeps its own state: selected filter page, scroll positions and loaded data. Both sections load and refresh independently when the app starts or returns to the foreground; switching does not refetch and never resets a scroll position.
- The last-used section is persisted locally and opens on the next cold start.
- Back on a section root behaves as today (leaves the app); it does not return to the previous section.

**AddButton**

- 60dp circle (`pill`), glossy `buttonPrimary` finish from `ButtonSurface` (variant 1 / Purple), 22dp plus icon in `onButtonPrimary` with a 2.2dp stroke. Anchored exactly where Scan was: 24dp from the end edge and 28dp above the bottom safe area, outside the pager and section content, in every state including cold start, loading, empty and error. Content description “Add”. Uses the Goho press; no ripple. Disabled (40%) only while a scanner is opening.
- Leave list and status bottom padding so the last row and status content clear the button, as before.

**AddMenu** (tap the Add button)

- The plus rotates 45° into a close mark (content description “Close add menu”). A full `scrim` fades in over the section content, below the button and menu.
- Actions stack right-aligned above the button: bottom action 16dp above it, 10dp between actions. Order is fixed on every section, top to bottom: **Scan book**, **Scan receipt**. Each action is a 52dp pill (`pill`) on `sheet` with the sheet ring and shadow, 16dp start and 20dp end padding, a 20dp icon in `onAccentContainer`, 10dp gap and the label in `rowTitle` / `textPrimary`. Minimum width fits the label; large text grows the pill and wraps rather than truncates.
- Choosing an action closes the menu immediately and opens the document scanner for that kind of scan. Both use the shared scan preview (section 4): Scan receipt with “New receipt” / “Upload receipt” to `POST /receipt-uploads`, Scan book with “New book” / “Upload” to `POST /book-uploads`. After a successful upload, switch to that section if needed and show All at the top. Cancel, in the scanner or the preview, returns to the section the scan started from. A scanner that fails to open only logs the error, with no notice.
- Tap the scrim, the close mark or Back to dismiss. Semantics: `menu` with `menuitem` actions; focus moves to the first action on open and back to the Add button on close.

**Motion**

- Section menu: fade and scale from 0.96 at the title’s start corner over `SECTION_MENU_MILLIS` (160ms); close reverses in 120ms. Chevron rotation shares the timing.
- Add remains visually pressed for the entire time the menu is open, then springs back when dismissed. Purple glossy buttons use a violet lower shade in their face and inset reflection.
- Add menu: actions rise 8dp, fade and spring from 0.92 scale (damping 0.6, stiffness 450). Opening Add gives a ContextClick haptic. Scan receipt enters after 45ms, followed by Scan book 45ms later; each entry gives a lighter SegmentTick. Closing cancels pending entry haptics. Closing fades and shrinks each action over 140ms in reverse order with the same stagger. The full-screen overlay fades linearly over 240ms on opening and 180ms on closing; it has independent timing from the staggered actions. The icon keeps 180ms opening / 140ms closing timing. Interrupted animations continue from their current position.
- Remove animations: menus appear and disappear immediately without stagger, entry haptics, scale or rise (the initial Add press still gives feedback), the icon swaps without rotating, and a section change crossfades title and content over 150ms with no roll. The swipe still works and commits without following the finger.

## 8. Books (list)

Native list-only implementation of the October 22 design (`nav-add-closed-*.png`, `nav-menu-books-*.png`). Books follows the Receipts list patterns with its own data; saved rows open the book overlay (section 9) with the Goho pressed fill on tap (inset and rounded inside the card, see `BookRow` in `components.md`), and the book options sheet (section 5) on a hold; both can delete the book. Scan rows stay display-only. New scans come from the Add menu’s Scan book (sections 4 and 7). Deleting failed scans, editing and search are not implemented.

**Header:** `SectionTitle` “Books” with the shared menu, then the shared All / Needs attention tabs. All counts every displayed row, including scans in progress and failed scans; the menu's Books count is saved books only.

**Data:** `GET /book-uploads` then `GET /books`, together on start, return to the foreground, pull and retry, independently of receipts. Listing scans first means each succeeded scan's book is already saved. While a scan is queued or processing, Books polls quietly every 5s only while the app is in the foreground. A refresh joins or queues behind one already running. An accepted cover upload appears at the top of a loaded list immediately and the list refreshes; a listing that began before it, or before a deletion, is discarded and reloaded.

**List:** one ungrouped `ListCard`, 12dp below the header fade so its top edge stays visible; no date or category headings. Queued and processing scans (“New book”, a shimmering metadata pill, Purple “Reading cover…”) and failed scans (“Unknown book”, upload time, Orange “Not processed”) come first, newest first. Saved books follow A–Z by title, ignoring case and ordered for the app locale, with equal titles in server order (newest first); scans stay pinned above them and there is no sort control. Each saved book shows its cover, one-line title, author with optional “· reading level”, and its server category as a labelled `Tag` anchored to the row’s bottom end, 16dp past the text; book dividers start at 76dp, aligned with the text after the 48×56dp cover. A succeeded scan never adds a second row. Needs attention lists failed scans. Covers load only for books with `hasImage`; books without one, or whose cover fails to load, show the small generated cloth cover in their category colour (approved October 22, 2026; see `BookCover` in `components.md` and section 9). See `BookRow` in `components.md`.

**States:**

- Initial loading: four skeleton rows in the same card with one “Loading books…” announcement after the shared 200ms delay.
- No books or unfinished scans on All: the approved [book-holding Bram](../assets/illustrations/status-no-books.png), “No books yet” / “Saved books will appear here.” Render it unchanged in the shared 220×190dp illustration slot with a 4dp title gap, directly on either theme’s background without a card. Keep the existing copy and no instruction to scan.
- Needs attention, empty: the shared “All good” state.
- Load error: the shared load-error artwork and retry, “We couldn’t load your books. Let’s try again.”
- Refresh: the shared pull-to-refresh with “Refresh books” and “Refreshing books…”. A failed refresh keeps the cached rows and shows only the indicator's warning triangle, as on Receipts.
- After deleting a book (from the overlay, section 9, or the options sheet, section 5): its row folds out (fade and height, 280ms, the receipt removal timing) and can’t be tapped or held; after an overlay deletion its cover slot stays empty; dividers close up and the All count and the menu's Books count drop immediately. Its succeeded scans leave with it; every other row, the filter page and scroll positions stay. Deleting the last entry shows the book-holding Bram once the row has folded. A listing that started before the deletion is discarded, success or failure, and the list reloads, so it can’t bring the book back. Reduced motion removes the row without folding.
- Scanner: no inline notices while the scanner opens or when it fails, on Books or Receipts (removed October 23, 2026 at the user's request).

**Large text:** at font scale ≥1.3 or narrow widths the category or upload tag moves beneath the metadata, end-aligned, and metadata may wrap. Titles stay on one line with an ellipsis.

## 9. Book overlay (lifted book)

Approved design, October 22, 2026. Implemented natively, including Delete book for saved books (its button, confirmation, “Deleting…” and error state). Not processed scans opening the options sheet remains planned; scan rows stay display-only until it is requested. Replaces a separate book details screen: books carry nothing beyond what the row shows, so tapping a saved book lifts its cover out of the list instead of navigating. Mockups: `book-overlay-pressed-light.png`, `book-overlay-flight-light.png`, `book-overlay-light.png`, `book-overlay-dark.png`, `book-overlay-flight-dark.png`, `book-overlay-dismiss-dark.png`, `book-overlay-confirm-light.png` and `book-overlay-delete-error-dark.png`. Books and covers in them are sample data. `assets/compose/BookOverlay.kt`, `BookOverlayFooter.kt` and `GeneratedBookCover.kt` mirror the native overlay, its Delete book footer and the generated cover.

Opened by tapping a saved book row. Rows still reading a cover are not tappable. Approved but not implemented: Not processed book scans open the options sheet with Delete scan (`DELETE /book-uploads/{uploadId}`), exactly as Not processed receipts do; natively they stay display-only. The overlay is a modal layer inside the Books section, not a destination: no route, and the section, filter page and scroll position stay underneath. Natively, `BookOverlayHost` wraps the section root (header, pages and Add) in one `SharedTransitionLayout` and draws the overlay above it. One transition presents the overlay and fades Add: the host passes Add’s opacity through its content slot to `SectionScreen`’s `addAlpha`. The overlay keeps a snapshot of the tapped book, so refreshes and polling never change or close it. It shows the row’s data (title, author, reading level, category), so it needs no extra request. The cover comes from `GET /books/{bookId}/image` only when `hasImage` is true.

**Layout** (over the whole screen, including the header and Add button):

- Frost: the theme `background` at 86% with a 14dp blur over the list (where blur is unavailable, 94% with no blur). Tapping the frost closes.
- Add gives way to the overlay: the frost isn’t opaque, so the purple button and its shadow would otherwise show through behind Delete book. Add stays mounted but is invisible, including its shadow, while the overlay is open; it fades back after Close and the footer leave, finishing with the frost. While invisible it takes no taps or focus and is hidden from accessibility. The Add menu and title menu don’t hide it.
- Close: a variant 2/Grey round 44dp button with an X, 16dp from the end, at the top bar position. “Close” for accessibility.
- Cover: centered horizontally, starting 76dp below the top inset. Photo covers keep their own aspect ratio inside a `bookCover` box of 260×292dp (at most 292dp tall and 260dp wide; a 2:3 cover is about 195×292dp, a square picture book 260×260dp), never cropped, clipped to shape `cover` (8dp), with a 1dp `outline` ring and a soft drop shadow (0/16/34dp, black at 45% dark / `shadow` at 30% light, −12dp spread). Tap opens the existing photo viewer with the full image; accessibility action “View book cover”, viewer description “Book cover, {title}”. Books without a cover use the generated cover below.
- Text, 24 below the cover, 24dp side padding, centered: title in `bookTitle` (26/32sp SemiBold, −0.02em, `textPrimary`, wraps, never truncated); 6dp below, author then “ · reading level” when set, 16/22sp Regular `textSecondary`; 14dp below, the category `Tag` from the server `icon` and `color` keys.
- Delete book: a full-width variant 2/Grey `ActionButton` 16dp from each side, 16dp below the scrolling content and 28dp above the navigation bar inset, with the shared trash glyph (`TrashIcon`, 18dp) and label in `onDangerContainer`. `BookOverlayFooter` owns this fixed action area: the button, its confirmation, “Deleting…” and the failure message.
- When the cover and text are taller than the space between the top and the footer (long titles, large font scales), they scroll; Close and the footer stay fixed.

**Generated cover** (approved October 22, 2026, “cloth”; `hasImage` false, or the image fails to load): use a 200×292dp `cover` slot (2:3, at the top of the `bookCover` box) so every lifted book has a consistent shape, and draw a clothbound book in the category colour with the title and author printed straight on it. Cloth: the category `TagColor` content colour in light mode; in dark mode, the dark container mixed 24% toward the dark content colour. Spine: a 14dp band on the leading edge in the cloth colour mixed 28% toward black, followed by a 2dp highlight in white at 22% (light) / 10% (dark). Text, in one same-hue contrasting colour: the category `TagColor` container in light mode, and the dark content colour mixed 40% toward white in dark mode (5.2:1 or better on the cloth in every colour). Title in `bookCoverTitle` (22/28sp SemiBold, −0.01em) at 26dp top, 34dp start (past the spine) and 20dp end, up to 5 lines with an ellipsis. Author in 16/20sp Medium, one line with an ellipsis, 20dp from the bottom with the same side insets. No label, card or rule. The slot keeps a 1dp inset ring (black 8% light, white 6% dark) and the same shadow as a real cover. It is decorative: not tappable, no viewer, and hidden from accessibility (the overlay text already announces the title and author). Unknown category colours use Grey (Fiction and Nonfiction are Grey today). The Books list uses the small version of this cover (see `BookCover` in components.md).

**Motion** (shared element, `SharedTransitionLayout` with the row’s `BookCover` as the source). Natively, both covers use `sharedBounds` keyed by book ID: photo covers remeasure to the flying bounds so the crop opens out, and generated covers scale so their printed title doesn’t reflow. The overlay cover flies alone and, on close, fades over the returning row cover:

- Open, 290ms (sped up from 340ms at the user's request, October 23, 2026), emphasized decelerate: the cover’s bounds transform from the 48×56dp row cover to its overlay size and position; a photo cover’s 48×56dp crop opens out to the full image as it grows (animate the clip, not the scale). The row keeps an empty thumbnail slot while the cover is away. The frost fades in over the first 170ms while Add fades out. Close and Delete book fade in and rise 8dp over the last 30%. Once the cover has landed (260ms), the title, author line and category tag each fade in and settle 8dp down into place over 260ms with emphasized decelerate, staggered 70ms apart; they leave together with Close.
- The full-size image replaces the cached thumbnail with a 150ms crossfade when it arrives; until then the upscaled thumbnail stands in. A failed load keeps the thumbnail upscaled; there is no error.
- Close (Close, Back, tap on the frost), 220ms: the same transform in reverse, back into the row, which may have scrolled; if the row is off screen, the cover fades out instead. Close and Delete book leave over the first 30%; only then does Add fade back in, finishing with the frost. Deletion’s fade-out restores Add the same way.
- Swipe down anywhere on the cover or text: the cover follows the finger and scales toward 0.86, while the frost and text fade with the drag. Releasing past 96dp or with a downward fling of 1,000dp/s closes; otherwise it springs back (damping 0.8, stiffness 400).
- Reduced motion: 150ms crossfade in and out; no flight, scale or rise. Add disappears at once and reappears when the overlay has faded out. Swipe down still closes.

**Accessibility**: a modal pane titled with the book’s title. Focus moves to Close on open and back to the row on close (not after deletion, since the row is leaving). The cover and generated cover are described once (“View book cover” when tappable); the title is a heading. Back closes the overlay before anything else.

**Deleting a book** (implemented for saved books; mockups `book-overlay-confirm-light.png`, `book-overlay-delete-error-dark.png`):

- Delete book swaps in place for a variant 1/Red “Delete book” button and a variant 2/Grey “Cancel” button, 10dp apart, as in the options sheet confirmation (section 5): no heading or description. The swap uses the sheet’s content timing (90ms fade out, 180ms fade in, 280ms size change), and snaps with Remove animations. Focus moves to Cancel. Cancel closes the overlay like Close, keeping the book, as Cancel closes the receipt sheet.
- Confirming sends one `DELETE /books/{bookId}` for the overlay’s snapshot book. The red button shows “Deleting…” (announced politely, with space reserved for both labels) and both buttons are disabled. While it is pending the overlay is locked: Close is disabled, and Back, frost taps, swipe-down, Cancel and the photo viewer do nothing.
- Only 204 counts as success. Any other response (including 404) or a network error keeps the overlay open and unlocks it, with “Couldn’t delete this book. Try again.” (`body`, `onDangerContainer`, centered, polite live region) 18dp above the buttons. Retry deletes the same book; Cancel, Close, Back, frost and swipe close it as usual.
- Success fades the whole overlay out (220ms; 150ms with Remove animations) without flying the cover home, and the row folds out of the Books list (section 8). `DELETE /books/{bookId}` also removes the book’s scans and cover; there is no undo.

Not part of Books: editing, cover replacement, search or manual entry.
