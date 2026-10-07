# Bram sources

- `reference/bram-v3.png`: original neutral Bram identity and proportions.
- `no-receipts.prompts.json`: generation and edge-refinement prompts for the current empty-state illustration. Current file references are relative to this directory; the historical pose reference is recorded as a Git object.

The approved PNG master is [status-no-receipts.png](../status-no-receipts.png). The Android drawable is its production copy; do not keep an additional master here. Preserve Bram’s broad lilac body, long rounded arms, small ivory horns, tiny feet and soft texture.

Only the no-receipts pose and neutral Bram stance are in scope. The earlier accessory concept sheet is preserved in Git history at the object named in `no-receipts.prompts.json`, because it was an input to this illustration. Additional character states and their source artwork will be added with their implementation in a later PR.

Current native screen references live in [mockups](../../mockups/). Regenerate them with the Android capture tooling in `programs/goho-android/tools/bram-captures/` at the repository root. Generated captures and reports belong in the ignored Android `build/` directory. Earlier artwork and review evidence remain in Git history.
