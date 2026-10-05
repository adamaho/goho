# Illustrations

Illustrations for the StatusCard (screens.md section 6). Each one stars Bram with a couple of soft props, so the states feel like the same family.

- `status-needs-attention(-dark).png`: Needs attention filter with nothing in it (Bram in front of two tidy receipts, check and sparkle chips)
- `status-no-receipts(-dark).png`: no receipts yet (Bram beside a blank receipt, peach plus chip)
- `status-load-error(-dark).png`: receipts couldn't load (Bram under a soft cloud, peach wifi-off chip)

PNGs are 660×570 (3× of the 220×190dp slot) with transparent backgrounds; put them in `res/drawable-nodpi` (same file names with underscores) or convert to WebP. Pick the `-dark` file when the dark theme is active.

Bram is composited from the approved character sheet, never redrawn, so there is no SVG source. Props (receipts, chips, cloud) are drawn as SVG and rasterised underneath him with a soft indigo shadow.
