# Bram no-receipts native review

This review renders the production `ReceiptOverview`, `GohoTheme`, and drawable resources using Robolectric 4.17 native Android graphics on API 35 and Roborazzi 1.76.0. These are native Compose app renders without system bars, not emulator screenshots or HTML mockups.

## Run

From the repository root, render the current artwork:

```sh
art/bram/no-receipts-review/render.sh after
```

Configure Java 17 through `JAVA_HOME` or the Java on `PATH`, and an Android SDK through `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or the Android project’s `local.properties`. The script preserves those settings. Gradle needs write access to its normal user cache and network access if dependencies are missing. Run Gradle serially. The script saves captures, semantics, and the actual JUnit test report in the selected output directory.

`before/` is the archived capture from before this change. Do not overwrite it by running the `before` mode against the new artwork. Recreating that baseline requires the original resources and original theme-specific selection recorded in Git and `harness-provenance.json`.

The built-in imagegen tool created the new artwork from [original Bram](../reference/bram-v3.png) and the [receipt concept sheet](../concepts/bram-receipt-typing-v01.png). The exact generation and edge-refinement prompts are in [prompts.json](prompts.json). The master is [assets/bram-first-receipt-v01.png](assets/bram-first-receipt-v01.png), a 1350×1165 RGBA PNG. It decodes to approximately 6 MiB before platform overhead; this review checks presentation, not physical-device memory or frame-time performance.

The historical harness was recovered from commit `c8f96f46a34118d3d45e44f3f7b2aa710afb86a8`. Its Kotlin test source is unchanged; the Gradle init script now requires an explicit evidence root instead of a machine-specific fallback. Original and current harness hashes, original drawable hashes, and the portability changes are recorded in [harness-provenance.json](harness-provenance.json). Test filters restrict execution to five no-receipts checks: light and dark at 360×800dp, short at 360×640dp, tall at 412×960dp, and 2× font at 360×640dp. Each screenshot is at 2× density. The large-text check asserts that Scan remains visible and body copy can be revealed by scrolling. Per-capture semantics accompany the PNGs.

Dependencies are added only to the invocation through `harness/init.gradle`; no production Gradle files or app test sources were edited. `original-assets/` preserves the two original no-receipts drawables. Other receipt states are outside this review.

Baseline: all five checks passed. Light, dark, short, tall, and large-text output hashes exactly reproduce the prior approved native evidence. See `before/validation.json` and `before/test-results.xml`.

After: all five checks passed with Bram holding a blank receipt directly on the screen background, without card fill, border or rounded clipping. Both themes use the same transparent `status_no_receipts` drawable, matching the canonical artwork SHA-256 in `after/validation.json`. The redundant dark production drawable was removed. Illustration, text, header and Scan positions are unchanged. All six semantics dumps match the baseline after excluding ephemeral identities and the removed 32dp card shape; heading, copy, Scan button role/name/action and traversal remain unchanged. Light, dark and 2× font captures show no clipping or overlap. The five current design mockups are byte-identical copies of these renders.

The card-backed version of the new artwork is preserved at commit `4a866b9`. Comparison against that version confirms changed pixels are confined to the former card bounds in all six captures; see `after/validation.json`. The original artwork baseline remains in `before/`.

`:app:assembleDebug :app:lintDebug :app:ktfmtCheck` passed after card removal. Lint reports 0 errors and 21 existing warnings plus one dependency-update notice for the unchanged OpenAPI generator version; see `after/build-validation.json`.
