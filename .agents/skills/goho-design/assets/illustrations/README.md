# Bram illustrations

Current Bram assets are limited to the no-receipts empty state and the neutral stance/header mark. The no-receipts artwork was refined on October 7, 2026 and checked in native Compose renders. The neutral header mark retains the approved PR #101 artwork. These PNGs are byte-for-byte copies of the Android drawable assets; keep both copies synchronized when artwork changes.

- `bram-mark.png`: neutral Bram stance used as a decorative header mark, displayed at 40×40dp in both themes. Omit it on the load-error screen.
- `status-no-receipts.png`: Bram gently cradling a small blank cream receipt. The same transparent asset is used in light and dark mode, directly on the screen background alongside the empty-state copy, without a surrounding card. No separate plus badge or typing indicator.

The no-receipts PNG is 1350×1165 RGBA. Render unchanged with ContentScale.Fit in the same 220×190dp slot that can shrink proportionally on narrow screens. Artwork is decorative; text supplies the accessible meaning. Android names use underscores instead of hyphens. Needs-attention and load-error states use text and their existing actions directly on the screen background, without cards or illustrations; additional character states and concept sheets are deferred to a later PR.

The SVGs in `legacy/` are the October 2 paper-and-pastel illustrations. They are retained for provenance, not as editable sources for the Bram PNGs. Do not re-export them over the current artwork. No editable Bram source is included in this PR.

The neutral Bram identity reference and no-receipts generation prompts live in [bram/](bram/README.md). `status-no-receipts.png` is the approved master; the Android drawable is its production copy. Current screen captures live in [mockups/](../mockups/README.md). Android capture tooling lives in `programs/goho-android/tools/bram-captures/` at the repository root and writes generated evidence to the ignored Android `build/` directory. Earlier resources and review evidence remain in Git history at commit `69c44fb`. No-receipts artwork was created with built-in imagegen; it is a raster source, not an editable 3D rig.
