# Bram illustrations

The app ships two Bram illustrations: the no-receipts empty state and calm “All good” pose for the empty Needs attention filter. These PNGs are byte-for-byte copies of the Android drawable assets; keep both copies synchronized when artwork changes. Neutral Bram artwork remains here as a design identity reference only. The Receipts header is text-only in every state.

- `bram-mark.png`: neutral Bram identity reference retained from PR #101. It is not shipped or displayed in the app.
- `status-no-receipts.png`: Bram gently cradling a small blank cream receipt. The same transparent asset is used in light and dark mode, directly on the screen background alongside the empty-state copy, without a surrounding card. No separate plus badge or typing indicator.
- `status-needs-attention.png`: Bram giving a calm thumbs-up with his familiar smile, rounded arm and lilac and cream palette. Pair it with “All good” and “Nothing needs your attention right now.” The same transparent asset serves both themes directly on the screen background, without a card, confetti or streamers.

Both empty-state PNGs are 1350×1165 RGBA. Render both empty-state illustrations unchanged with ContentScale.Fit in the shared 220×190dp slot that can shrink proportionally on narrow screens, with a 4dp gap before the title. Artwork is decorative; text supplies the accessible meaning. Android names use underscores instead of hyphens. Load error uses text and its retry action directly on the screen background, without a card or illustration. Additional character states and concept sheets are deferred until their feature is implemented.

The SVGs in `legacy/` are the October 2 paper-and-pastel illustrations. They are retained for provenance, not as editable sources for the Bram PNGs. Do not re-export them over the current artwork. No editable Bram source is included in this PR.

The neutral Bram identity reference and generation prompts live in [bram/](bram/README.md). `status-no-receipts.png` and `status-needs-attention.png` are the approved masters; their Android drawables are production copies. Current screen captures live in [mockups/](../mockups/README.md). Android capture tooling lives in `programs/goho-android/tools/bram-captures/` at the repository root and writes generated evidence to the ignored Android `build/` directory. Earlier resources and review evidence remain in Git history at commit `69c44fb`. Both empty-state illustrations were created with built-in imagegen; they are raster sources, not editable 3D rigs.
