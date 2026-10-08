# Android validation

Do not add or run automated tests for the Android app, including unit tests,
instrumentation tests, screenshot test harnesses, or test-only dependencies.

Validate Android changes with `:app:assembleDebug`, `:app:lintDebug`,
`:app:ktfmtCheck`, and manual visual and interaction checks.
