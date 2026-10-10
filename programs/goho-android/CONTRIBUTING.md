# Contributing to Goho Android

Follow the repository-wide [CONTRIBUTING.md](../../CONTRIBUTING.md) for commits
and shared checks. This guide covers the standalone Android project in this
directory. Scanning works without the Goho server; the connection status needs
one running on port 3000.

## Prerequisites

- Install [Android Studio](https://developer.android.com/studio) and use its SDK
  Manager to install Android SDK Platform 37 and the Android SDK Build-Tools.
- Install a JDK 17 or newer to run Gradle. The project requests a Java 17
  toolchain, and the checked-in Gradle wrapper supplies Gradle itself.
- Create an [Android Virtual Device](https://developer.android.com/studio/run/managing-avds)
  with API level 24 or newer, or connect a physical Android device with
  [USB debugging](https://developer.android.com/studio/run/device) enabled.

Android Studio normally configures the SDK location in the ignored
`local.properties` file. For command-line use, set
[`ANDROID_HOME`](https://developer.android.com/tools/variables) to your SDK
directory and put its `platform-tools` directory on `PATH` so `adb` is available.

## Run the app

In Android Studio, open `programs/goho-android` as a project, wait for Gradle
sync, select `developmentDebug` in the Build Variants window, then choose the
`app` run configuration and an emulator or connected device and click Run.

Or, from the repository root, build and install with the checked-in wrapper:

```bash
cd programs/goho-android
./gradlew :app:assembleDevelopmentDebug
adb devices
./gradlew :app:installDevelopmentDebug
```

Start the emulator or connect the device before `adb devices`, then launch Goho
from its app icon. The debug APK is at
`app/build/outputs/apk/development/debug/app-development-debug.apk`. See the official
[command-line build guide](https://developer.android.com/build/building-cmdline)
for other build and install options.

The debug app defaults to `http://127.0.0.1:3000`. To check connectivity from
an emulator or connected phone without exposing the unauthenticated server on
the network, run `adb reverse tcp:3000 tcp:3000` before opening Goho. With
multiple devices connected, add `-s <device-id>` to the `adb` command. An HTTPS
server URL can be supplied at build time with `-PgohoServerUrl=https://...`.

## Install development and production together

The `development` and `production` product flavours each support debug and
release builds. **Goho Dev** (`com.adamaho.goho.dev`) and **Goho**
(`com.adamaho.goho`) have separate app storage and update independently.

Build and install the production debug variant alongside development:

```bash
./gradlew :app:installProductionDebug -PgohoProductionServerUrl=https://your-server
```

Production requires an explicit HTTPS URL; `gohoServerUrl` overrides only the
development URL. You can also set `gohoProductionServerUrl` in your untracked
user Gradle properties for Android Studio. Select `productionDebug` in the
Build Variants window to run it. Its APK is at
`app/build/outputs/apk/production/debug/app-production-debug.apk`.

Both debug variants support installation over an already paired wireless ADB
connection. Development uses `adb reverse tcp:3000 tcp:3000` for the local
server; run it again after reconnecting. The loopback HTTP exception applies
only to `developmentDebug`; production uses HTTPS.

## Verification

Do not add or run automated tests for the Android app, including unit tests,
instrumentation tests, screenshot test harnesses, or test-only dependencies.

Validate Android changes with `:app:assembleDevelopmentDebug`, `:app:lintDevelopmentDebug`,
`:app:ktfmtCheck`, and manual visual and interaction checks.

From `programs/goho-android`, build and lint both debug variants as CI does:

```bash
./gradlew :app:assembleDevelopmentDebug :app:lintDevelopmentDebug \
  :app:assembleProductionDebug :app:lintProductionDebug \
  -PgohoProductionServerUrl=https://example.invalid
```

CI uses a non-routable example URL for build validation. Supply your actual
HTTPS server URL when building an APK to install. Both APKs are produced in
separate output directories in the same build.

Format or check Kotlin source with the Android-specific pnpm shortcuts from the
repository root:

```bash
pnpm fmt:android
pnpm fmt:check:android
```

For changes elsewhere in the workspace, also run `pnpm check` from the repo
root as described in the root contributing guide.

## Generated API client

The Kotlin API client is checked in under
`app/src/main/kotlin/com/adamaho/goho/api/generated`. Normal builds and Android
Studio can use it without running the generator. Do not edit generated files.
When the shared API changes, regenerate the
[OpenAPI contract](../../packages/goho-api/openapi.json) from the repository root:

```bash
pnpm --filter @goho/goho-server openapi:generate
pnpm --filter @goho/goho-server openapi:check
```

Then update the checked-in client from `programs/goho-android`:

```bash
./gradlew :app:updateOpenApiClient
```

Commit both the contract and Kotlin changes. Android CI regenerates the client
and fails if it differs from the committed copy. Kotlin formatting excludes the
generated package.

The server derives its OpenAPI document from the shared API at runtime. The
generator uses the committed copy without running the server, so `openapi:check`
fails when that copy is stale.

## Code organization and style

Keep this app small while it has one screen. `MainActivity` owns the Android
entry point, `ui/main` owns the screen, and `theme` owns Compose theming. As
features grow, follow the official [Guide to app architecture](https://developer.android.com/topic/architecture)
and [architecture recommendations](https://developer.android.com/topic/architecture/recommendations):
keep UI state and business data separate, use a screen-level `ViewModel` when
the screen has state or logic to manage, and add repositories when there are
data sources to coordinate. Add a domain layer only when its complexity earns
one. Avoid creating empty layers for future features.

Use [Kotlin coding conventions](https://kotlinlang.org/docs/coding-conventions.html)
for naming and four-space indentation. Prefer immutable `val`, Kotlin null
safety, and small functions with clear responsibility. For asynchronous work,
follow Android's [coroutines best practices](https://developer.android.com/kotlin/coroutines/coroutines-best-practices)
