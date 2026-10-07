# Bram native captures

Render the production `ReceiptOverview`, `GohoTheme`, and Android drawables with Robolectric 4.17 native graphics on API 35 and Roborazzi 1.76.0. These are native Compose renders without system bars.

From the repository root:

```sh
programs/goho-android/tools/bram-captures/render.sh
```

Configure JDK 17 through `JAVA_HOME` or `PATH`, and the Android SDK through `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or the Android project's `local.properties`. The script preserves these settings. Gradle needs access to its user cache and network access when dependencies are missing. Run Gradle serially.

Outputs default to the ignored `programs/goho-android/build/bram-captures/` directory: six PNG screenshots, six semantics dumps, and `test-results.xml`. An optional first argument selects another output directory, relative to the caller's working directory or absolute. The capture invocation always reruns its filtered tests. Treat these as generated build artifacts; keep only approved screen mockups in the design skill.

The five test filters are `ReceiptEvidenceTest.noReceiptsLight`, `noReceiptsDark`, `smallEmpty`, `tallEmpty`, and `largeTextEmpty`. They cover light and dark at 360×800dp, short at 360×640dp, tall at 412×960dp, and 2× font at 360×640dp. Captures use 2× density. The large-text check captures both initial and scrolled states and asserts that Scan stays visible and body copy is reachable by scrolling.

Artwork references and generation prompts live under [the design skill's Bram sources](../../../../.agents/skills/goho-design/assets/illustrations/bram/). The approved PNG master is [status-no-receipts.png](../../../../.agents/skills/goho-design/assets/illustrations/status-no-receipts.png). Approved screen references live in [its mockups directory](../../../../.agents/skills/goho-design/assets/mockups/). Generated capture history remains available in Git: commit `4a866b9` contains the original-artwork baseline and the card-backed receipt artwork, and `69c44fb` contains the cardless state, under the former `art/bram/no-receipts-review/` path.

The Kotlin harness was recovered from commit `c8f96f46a34118d3d45e44f3f7b2aa710afb86a8` and remains unchanged. [Harness provenance](harness-provenance.json) records the original/current hashes and Gradle portability changes. Dependencies and test sources are added only for this invocation through `harness/init.gradle`; production Gradle files and app tests are unchanged. Filters restrict this command to the five no-receipts checks despite other historical cases in the recovered harness.
