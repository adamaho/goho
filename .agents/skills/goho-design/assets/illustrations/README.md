# Bram illustrations

The app ships five Bram illustrations: the no-receipts and no-books empty states, calm “All good” pose for the empty Needs attention filter, gentle shrug for receipt load errors, and the magnifying glass for a book search with no matches. These PNGs are byte-for-byte copies of the Android drawable assets; keep both copies synchronized when artwork changes. Neutral Bram artwork remains here as a design identity reference only. The Receipts header is text-only in every state.

- `bram-mark.png`: neutral Bram identity reference retained from PR #101. It is not shipped or displayed in the app.
- `status-no-receipts.png`: Bram gently cradling a small blank cream receipt. The same transparent asset is used in light and dark mode, directly on the screen background alongside the empty-state copy, without a surrounding card. No separate plus badge or typing indicator.
- `status-needs-attention.png`: Bram giving a calm thumbs-up with his familiar smile, rounded arm and lilac and cream palette. Pair it with “All good” and “Nothing needs your attention right now.” The same transparent asset serves both themes directly on the screen background, without a card, confetti or streamers.
- `status-load-error.png`: Bram gently shrugging with his original rounded arms, without thumbs. Pair it with “A little hiccup” and “We couldn’t load your receipts. Let’s try again.” The same transparent lilac and cream asset serves both themes, directly on the screen background above the retry action.

All five PNGs are 1350×1165 RGBA. Render all five illustrations unchanged with ContentScale.Fit in the shared 220×190dp slot that can shrink proportionally on narrow screens, with a 4dp gap before the title. Artwork is decorative; text supplies the accessible meaning. Android names use underscores instead of hyphens. Load error retains its text-only Receipts header, no filters or Scan, and a stable disabled retry button while retrying. Additional character states and concept sheets are deferred until their feature is implemented.

## Approved Books artwork

[status-no-books.png](status-no-books.png) is the user-approved October 23, 2026 “No books yet” illustration: Bram gently holding one blank cream hardcover between his long rounded arms. The PNG is 1350×1165 RGBA, with true alpha transparency and a small contact shadow. Preserve its original bytes, face, proportions, texture and book. Its [provenance](bram/no-books.prompts.json) records the source references, prompts and SHA-256.

The Android `status_no_books.png` is a byte-for-byte copy of this master. `NoBooksState` uses the shared `StatusContent` slot and 4dp title gap, the same transparent artwork in both themes, and the unchanged “No books yet” / “Saved books will appear here.” copy. Do not add a surrounding card or a scan instruction. Keep discarded candidates and review exports in ignored `.data/`.

## Approved search artwork

[status-no-search-results.png](status-no-search-results.png) is the user-approved October 24, 2026 pose for no matching search results, initially for Books: Bram holds a cream magnifying glass over one eye with a gentle smile and his original rounded arms. The selected 1350×1165 RGBA master is preserved unchanged; its [provenance](bram/no-search-results.prompts.json) records the references, prompt and SHA-256. It is distinct from the “No books yet” book-holding pose.

The Android `status_no_search_results.png` is a byte-for-byte copy of this master. Book search’s no-matches state ([screens.md section 10](../../references/screens.md#10-book-search)) uses the shared 220×190dp `StatusContent` illustration slot with `ContentScale.Fit`, a 4dp title gap, the same transparent PNG in both themes and no surrounding card, with its copy and small Clear search action. The illustration is decorative; the state’s text supplies its accessible meaning.

The SVGs in `legacy/` are the October 2 paper-and-pastel illustrations. They are retained for provenance, not as editable sources for the Bram PNGs. Do not re-export them over the current artwork. No editable Bram source is included in this PR.

The neutral Bram identity reference and generation prompts live in [bram/](bram/README.md). `status-no-receipts.png`, `status-no-books.png`, `status-needs-attention.png`, `status-load-error.png` and `status-no-search-results.png` are the approved masters; their Android drawables are production copies. Current screen captures live in [mockups/](../mockups/README.md). Earlier resources and review evidence remain in Git history at commit `69c44fb`. All five illustrations were created with built-in imagegen; they are raster sources, not editable 3D rigs.
