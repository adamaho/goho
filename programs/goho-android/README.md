# Goho Android

Goho's Android app is the starting point for submitting receipts from a phone.
It currently shows a placeholder screen; scanning, uploads, and receipt views
are not available yet. No server connection is needed to run the current app.

## Run the app

Install [Android Studio](https://developer.android.com/studio) and the Android
SDK Platform 36. Create an emulator with Android API 24 or newer, or connect a
device with USB debugging enabled.

Open `programs/goho-android` in Android Studio, choose the `app` run
configuration and your device, then click Run.

You can also build and install from a terminal:

```bash
cd programs/goho-android
./gradlew :app:assembleDebug
./gradlew :app:installDebug
```

Start an emulator or connect a device before running `installDebug`. The
assembled APK is at `app/build/outputs/apk/debug/app-debug.apk`.

## API client

The app builds a Kotlin client from the shared
[Goho API contract](../../packages/goho-api/README.md) with
[OpenAPI Generator](https://openapi-generator.tech/). Generated files live under
`app/build/generated/openapi` and are not committed. The client is compiled
into the app but is not used by the placeholder screen yet. The next app work
will connect it to the [Goho server](../goho-server/README.md).

For local development, architecture guidance, and verification commands, see
[CONTRIBUTING.md](./CONTRIBUTING.md).
