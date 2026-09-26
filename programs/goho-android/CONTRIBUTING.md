# Contributing to Goho Android

Follow the repository-wide [CONTRIBUTING.md](../../CONTRIBUTING.md) for commits
and shared checks. This guide covers the standalone Android project in this
directory; it does not require the Goho server to run the current placeholder
screen.

## Prerequisites

- Install [Android Studio](https://developer.android.com/studio) and use its SDK
  Manager to install Android SDK Platform 36 and the Android SDK Build-Tools.
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
sync, select the `app` run configuration and an emulator or connected device,
then click Run. The app currently shows a static receipt-scanning placeholder.

Or, from the repository root, build and install with the checked-in wrapper:

```bash
cd programs/goho-android
./gradlew :app:assembleDebug
adb devices
./gradlew :app:installDebug
```

Start the emulator or connect the device before `adb devices`, then launch Goho
from its app icon. The debug APK is at
`app/build/outputs/apk/debug/app-debug.apk`. See the official
[command-line build guide](https://developer.android.com/build/building-cmdline)
for other build and install options.

## Verification

From `programs/goho-android`, run the same Android build and lint checks as CI:

```bash
./gradlew :app:assembleDebug :app:lintDebug
```

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
