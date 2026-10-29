# Optimistic uploads: native captures

Unedited captures from Pixel_9_API_36 on 2026-10-28/29. The images use visibly labelled synthetic receipt/book photos, not user data. The existing Goho components, typography and colours render them directly.

## Captures

- `receipt-initial-upload-dark.png`: final APK, actual preview Upload action. At 1.14 seconds the matching Receipts/All list shows its saved photo and Uploading…; the real backend still has zero receipt uploads during a seven-second transport delay.
- `book-failed-options-large-dark.png`: final APK, shared failed-book options at 1.5× font scale with system animations disabled. Retry and Remove are readable and use the existing sheet/header styles.
- `receipt-uploading-light.png`: first-pass native Retry, before the new HTTP410 handling. The sheet closes immediately and the photo remains while the real POST waits; All stays at2 and Needs attention clears.
- `receipt-failed-sheet-light.png`: first-pass restored failed receipt with its photo and shared Retry/Remove sheet.
- `book-uploading-dark.png`: first-pass book Retry while the real backend accepted the photo but its response was withheld.
- `book-transfer-failed-dark.png`: the first-pass read-timeout failure retained its photo; native Retry subsequently recovered the same accepted ID without creating a second book scan.

## Manual validation and limits

Final APK was checked against an isolated real HTTP API, services, database and file storage. OCR workers were excluded: accepted photos stayed queued, so this does not verify recognition results. A temporary local proxy controlled delays and HTTP503 failures; it made no UI assertions and logged no photo contents or credentials.

Google Play services could not download the scanner module on this emulator. For final preview checks, the standard Java debugger supplied an existing `Capture` with a synthetic app-private file URI. The actual preview buttons, ContentResolver copy, durable records, navigation, generated Retrofit transport and real backend then ran normally. No app source hooks, Android automated tests, test dependencies or screenshot assertion harness were added. The external scanner capture and its URI-grant handoff remain unverified here.

Observed on the final APK:

- Book Upload copied its photo and immediately returned to Books/All. HTTP503 retained the image and record as an actionable Upload failed row.
- Retrying a book whose same server key had been accepted then deleted removed the local row/photo/record without creating another server upload. Its retained issued key and completed job remained; the empty Books state returned.
- A missing captured file kept the preview open with “Couldn’t save this photo. Try again.” and Retry upload; no partial files remained.
- At 1.5× text and with animations disabled, Cancel kept a failed book's photo/record; confirmed Remove cleared both and All returned to0. These checks establish normal operation under those settings, not a frame-by-frame animation measurement or a TalkBack audit.
- Receipt Upload returned to Receipts/All at the top before the server accepted it. Killing the app while sending, then reopening it, resumed the same ID. The overlapping original/resumed POSTs left exactly one receipt upload, queue job and stored file; the local queue became empty.

Private full evidence and build/review logs remain under the feature worktree's ignored `.scratch/` directory. The Goho design references describe the final API/state contracts; these captures do not replace those written rules.
