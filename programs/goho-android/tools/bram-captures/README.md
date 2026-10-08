# Bram native captures

Render the production `ReceiptOverview`, `GohoTheme`, and Android drawables with Robolectric 4.17 native graphics on API 35 and Roborazzi 1.76.0. These are native Compose renders without system bars.

From the repository root:

```sh
programs/goho-android/tools/bram-captures/render.sh
```

Configure JDK 17 through `JAVA_HOME` or `PATH`, and the Android SDK through `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or the Android project's `local.properties`. The script preserves these settings. Gradle needs access to its user cache and network access when dependencies are missing. Run Gradle serially.

Outputs default to the ignored `programs/goho-android/build/bram-captures/` directory: 21 PNG screenshots, 21 semantics dumps, and `test-results.xml`. An optional first argument selects another output directory, relative to the caller's working directory or absolute. The capture invocation always reruns its filtered tests. Treat these as generated build artifacts; keep only approved screen mockups in the design skill.

Twenty test filters cover the implemented screens and transitions:

- No receipts: `noReceiptsLight`, `noReceiptsDark`, `smallEmpty`, `tallEmpty`, and `largeTextEmpty`.
- All good (empty Needs attention): `noAttentionLight`, `noAttentionDark`, and `largeTextAttention`.
- Load error: `loadErrorLight`, `loadErrorDark`, and `largeTextError`.
- Retry and deletion: `retryFailureAndSuccess` and `deleteLastFailedOverall`.
- Initial loading: `initialLoadingLight`, `initialLoadingDark`, and `initialLoadingFastSuccessDoesNotFlash`.
- Request timing and accessibility: `backgroundRefreshStaysQuiet`, `retryFastSuccessDoesNotFlashDuringRecovery`, `largeTextRetryProgressKeepsBounds`, and `reducedMotionProgressStaysStatic`.

The no-receipts, empty Needs attention, and load-error states use their approved Bram artwork. All three states sit directly on the screen background. The Receipts header uses text only; illustrated status states use the shared 4dp image-to-title spacing. Empty Needs attention pairs the calm thumbs-up pose with “All good” and “Nothing needs your attention right now.” Load errors pair the gentle shrug pose with “A little hiccup”, “We couldn’t load your receipts. Let’s try again.”, and the existing retry action.

The captures cover light and dark at 360×800dp, short at 360×640dp, tall at 412×960dp, and 2× font at 360×640dp, all at 2× density. Large-text checks capture initial and scrolled states and assert that their relevant copy or actions are reachable.

Manual-clock loading checks assert no progress at 199ms, then advance through the 200ms deadline. Initial loading appears on the following display frame; nested retry content receives up to three bounded parent/child display frames. Retry timing stays anchored to the first pending composition, so those render frames never extend the asserted grace period. Fast requests and completed retry crossfades never show a late icon; each retry receives a new grace period, and background refresh remains quiet. Retry is disabled immediately while its label remains visible during the delay; the later icon preserves its accessible name, indeterminate progress, and button bounds at normal and 2× font sizes. Reduced-motion loading keeps the same delay and produces identical pixels across 512ms.

The retry check also verifies failure and recovery without shifting the error title; the deletion check verifies that deleting the last failed receipt preserves the selected Needs attention tab and visible Scan action. Eighteen selected screenshots are the approved mockups; the three additional initial large-text screenshots remain generated output.

Artwork references and generation prompts live under [the design skill's Bram sources](../../../../.agents/skills/goho-design/assets/illustrations/bram/). The approved PNG masters are [status-no-receipts.png](../../../../.agents/skills/goho-design/assets/illustrations/status-no-receipts.png), [status-needs-attention.png](../../../../.agents/skills/goho-design/assets/illustrations/status-needs-attention.png), and [status-load-error.png](../../../../.agents/skills/goho-design/assets/illustrations/status-load-error.png). Approved screen references live in [its mockups directory](../../../../.agents/skills/goho-design/assets/mockups/). Generated capture history remains available in Git: commit `4a866b9` contains the original-artwork baseline and the card-backed receipt artwork, and `69c44fb` contains the cardless state, under the former `art/bram/no-receipts-review/` path.

The Kotlin harness was recovered from commit `c8f96f46a34118d3d45e44f3f7b2aa710afb86a8`. Source changes remove the obsolete `output.name == "after"` phase guard from the existing deletion helper so it runs in the current output directory, update attention/error-state assertions to the approved “All good” and “A little hiccup” copy, and add focused manual-clock loading checks. [Harness provenance](harness-provenance.json) records original/current hashes, those changes, and Gradle portability changes. Dependencies and test sources are added only for this invocation through `harness/init.gradle`; production Gradle files and app tests are unchanged. Filters run the 20 checks listed above.
