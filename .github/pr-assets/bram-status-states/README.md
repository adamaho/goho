# Bram receipts status evidence

The screenshots render the real `ReceiptOverview` with its production components and supplied artwork. Robolectric 4.17 native Android graphics and Roborazzi 1.76.0 run on Android API 35. They are JVM app renders; system bars are excluded. No mock layouts or redrawn artwork are used.

- Baseline: `47e17f9bc2bea3b442d1e3a6c1b9f83f645830b3` from `dev`.
- Standard captures: 360 × 800 dp, xhdpi (720 × 1600 px), light and dark.
- Edge captures: 360 × 640 dp; 412 × 960 dp; system font scale 2.0. Scroll captures show complete body copy and a separate Scan footer.
- Before: 12 checks passed; four after-only checks skipped. After: all 16 checks passed; three additional large-font scroll checks passed.
- Retry remains disabled while running, preserves bounds after failure, and reveals the list on success. Deleting the last failed receipt preserves the attention filter with no badge, including when no other receipts remain.
- With Remove animations enabled, the initial, delayed, and pressed images are byte-identical.
- Both source revisions passed assemble, lint, and Kotlin formatting checks. Lint reported zero errors and the same 21 existing warnings. Existing copy is unchanged.

`verification.json` records production source/artwork SHA-256 values. The harness is external to the application and adds test dependencies only through the init script. The source PR does not include those dependencies.

## Reproduce

Use JDK 17, Android SDK Platform 37.0, and Build-Tools 36; set `JAVA_HOME` and `ANDROID_HOME`. Use the checked-in Gradle 9.8 wrapper. Run builds serially.

From the source revision being checked:

```sh
cd programs/goho-android
./gradlew :app:assembleDebug :app:lintDebug :app:ktfmtCheck --no-daemon --max-workers=4 --no-configuration-cache
```

For screenshots, start in this evidence directory and set `BRAM_SOURCE` to a checkout of the source revision. The output directory must end in `after` to enable the deletion and reduced-motion checks.

```sh
BRAM_EVIDENCE="$(pwd)"
BRAM_SOURCE="/absolute/path/to/goho"
BRAM_OUTPUT="$BRAM_EVIDENCE/results/after"
mkdir -p "$BRAM_OUTPUT"
cd "$BRAM_SOURCE/programs/goho-android"
./gradlew :app:testDebugUnitTest \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest' \
  -I "$BRAM_EVIDENCE/harness/init.gradle" \
  -Dgoho.evidence.root="$BRAM_EVIDENCE" \
  -Dgoho.evidence.output="$BRAM_OUTPUT" \
  --no-daemon --max-workers=4 --no-configuration-cache --no-build-cache
```

For baseline captures, use the baseline revision above and `BRAM_OUTPUT="$BRAM_EVIDENCE/results/before"`. The final harness also saves the extra large-font scrolled images when rerun.

In the original restricted runtime, the downloaded JDK executable needed an absolute library RPATH; the normal JDK `$ORIGIN` lookup could not resolve without `/proc`. Java's temporary directory and network proxy were configured for that runtime. Configuration caching and screenshot build caching were disabled for workspace filesystem limitations. The repository dependencies and versions were unchanged. Emulator boot was unavailable, so device-level validation is not claimed.

The repository-wide `pnpm fmt` attempt was blocked by Node `process.memoryUsage()` in that runtime. Android `:app:ktfmtFormat` and `:app:ktfmtCheck` passed.
