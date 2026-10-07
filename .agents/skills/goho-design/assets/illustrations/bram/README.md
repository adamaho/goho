# Bram sources

- `reference/bram-v3.png`: original neutral Bram identity and proportions; a design reference only, not shipped or displayed in the app.
- `no-receipts.prompts.json`: generation and edge-refinement prompts for the no-receipts illustration. Current file references are relative to this directory; the historical pose reference is recorded as a Git object.
- `needs-attention.prompts.json`: generation prompt and provenance for the approved calm thumbs-up illustration in the empty Needs attention state.

The approved PNG masters are [status-no-receipts.png](../status-no-receipts.png) and [status-needs-attention.png](../status-needs-attention.png). The Android drawables are their production copies; do not keep additional masters here. Preserve Bram’s broad lilac body, long rounded arms, small ivory horns, tiny feet and soft texture.

Only the no-receipts pose and calm thumbs-up for the empty Needs attention filter are shipped. The neutral Bram stance and former header mark remain design identity references only; the Receipts header is text-only in every state. The thumbs-up accompanies “All good” and “Nothing needs your attention right now.” Preserve its quiet lilac and cream palette without confetti or streamers. The earlier accessory concept sheet is preserved in Git history at the object named in `no-receipts.prompts.json`, because it was an input to this illustration. Additional character states and their source artwork will be added with their implementation in a later PR.

Current native screen references live in [mockups](../../mockups/). Regenerate them with the Android capture tooling in `programs/goho-android/tools/bram-captures/` at the repository root. Generated captures and reports belong in the ignored Android `build/` directory. Earlier artwork and review evidence remain in Git history.
