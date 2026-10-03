# Illustrations

Illustrations for the StatusCard (screens.md section 6). One scene per state, all in the same paper-and-pastel style.

- `status-needs-attention(-dark).png`: Needs attention filter with nothing in it (stamped, sorted receipts)
- `status-no-receipts(-dark).png`: no receipts yet (blank receipt in a scanner frame)
- `status-load-error(-dark).png`: receipts couldn't load (receipt under a cloud)

PNGs are 660×570 (3× of the 220×190dp slot) with transparent backgrounds; put them in `res/drawable-nodpi` or convert to WebP. Pick the `-dark` file when the dark theme is active.

The `.svg` files are the editable source. They use SVG drop-shadow filters, which Android vector drawables don't support, so ship the PNGs. To restyle, edit the SVG and re-export at 3×.

The app exports correct the sparkle paths to centre their visible bounds at (12, 12). Bubble rims use opaque theme colours so the receipt cannot show through the rim and create a cut-out edge. Keep the bubbles above the paper when editing. Export all six SVGs at 660×570 with SVG filter support (for example, resvg) and copy the PNGs to the Android drawable-nodpi directory.

The check stamp uses fully opaque jade ink with an 88% paper-coloured backing so receipt lines do not compete with the check.

The refresh icon is positioned by its drawn arc bounds (centre approximately 12, 11.086), rather than assuming a centred 24×24 path.
