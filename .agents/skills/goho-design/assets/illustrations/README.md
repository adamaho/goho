# Bram illustrations

Current no-receipts artwork was refined on October 7, 2026 using the Bram receipt concept sheet and checked in native Compose renders. The other artwork remains from PR #101, approved on device October 5. These PNGs are byte-for-byte copies of the Android drawable assets; keep both copies synchronized when artwork changes.

- `bram-mark.png`: decorative header mark, displayed at 40×40dp in both themes. Omit it on the load-error screen.
- `status-needs-attention(-dark).png`: Bram under two receipts with a lavender check badge and sparkle.
- `status-no-receipts.png`: Bram gently cradling a small blank cream receipt. The same transparent asset is used in light and dark mode. No separate plus badge or typing indicator.
- `status-load-error(-dark).png`: Bram under a cloud and peach wifi-off chip.

The no-receipts PNG is 1350×1165 RGBA; the other status PNGs remain 660×570 RGBA. Render unchanged with ContentScale.Fit in the same 220×190dp slot that can shrink proportionally on narrow screens. Select a `-dark` variant inside the component only for states that have one. Artwork is decorative; text supplies the accessible meaning. Android names use underscores instead of hyphens.

The SVGs in `legacy/` are the October 2 paper-and-pastel illustrations. They are retained for provenance, not as editable sources for the Bram PNGs. Do not re-export them over the current artwork. No editable Bram source is included in this PR.

The original no-receipts resources are preserved in `art/bram/no-receipts-review/original-assets/` at the repository root and in Git history. Generation prompts, the new master PNG and before/after native captures are in `art/bram/no-receipts-review/`. No-receipts artwork was created with built-in imagegen; it is a raster source, not an editable 3D rig.
