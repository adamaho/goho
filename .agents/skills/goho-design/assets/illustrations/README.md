# Bram illustrations

Current artwork from PR #101, approved on device October 5, 2026. These PNGs are byte-for-byte copies of the Android drawable assets; keep both copies synchronized when artwork changes.

- `bram-mark.png`: decorative header mark, displayed at 40×40dp in both themes. Omit it on the load-error screen.
- `status-needs-attention(-dark).png`: Bram under two receipts with a lavender check badge and sparkle.
- `status-no-receipts(-dark).png`: Bram beside a receipt and peach plus chip.
- `status-load-error(-dark).png`: Bram under a cloud and peach wifi-off chip.

Status PNGs are 660×570 with transparency. Render unchanged with ContentScale.Fit in a 220×190dp slot that can shrink proportionally on narrow screens. Select the `-dark` variant inside the component. Artwork is decorative; text supplies the accessible meaning. Android names use underscores instead of hyphens.

The SVGs in `legacy/` are the October 2 paper-and-pastel illustrations. They are retained for provenance, not as editable sources for the Bram PNGs. Do not re-export them over the current artwork. No editable Bram source is included in this PR.
