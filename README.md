# Welcome Abdallah (Android)

A personal Android app for collecting links:

- **Welcome screen** showing "Welcome Abdallah" for a moment on launch (tap to skip).
- **My Links home screen**, one page listing every link shared into the app, newest first,
  with search. Tap a link to open it; long-press to share, copy, or delete it.
- **Save to Links share target**: in any app (Chrome, YouTube, WhatsApp, X, ...) tap
  **Share** and choose **Save to Links**. The link is saved and you stay in the app you were using.
  Sharing the same link again moves it back to the top.

## Getting the APK

Every push runs the **Build APK** GitHub Actions workflow, which builds a release APK signed
with the permanent key and publishes `WelcomeAbdallah.apk` under this repository's **Releases**.
Because every build uses the same key and a higher version number, new versions install
directly over the old one and keep your saved links.

## Release signing

The keystore is never committed (this repository is public). The workflow reads it from these
repository secrets (**Settings > Secrets and variables > Actions > New repository secret**):

| Secret | Value |
| --- | --- |
| `RELEASE_KEYSTORE_BASE64` | The keystore file, base64 encoded |
| `RELEASE_KEYSTORE_PASSWORD` | Keystore password |
| `RELEASE_KEY_ALIAS` | `welcome` |
| `RELEASE_KEY_PASSWORD` | Key password (same as the keystore password) |

Without these secrets the workflow only runs a debug check build and publishes nothing.

Keep a private backup of the keystore and its password. If it is lost, future versions cannot
be installed over the existing app; it would have to be uninstalled first, which deletes saved links.

## Installing on a phone

1. Open the latest release on the phone and download `WelcomeAbdallah.apk`.
2. Open the downloaded file and allow "Install unknown apps" for your browser or file manager when prompted.
3. Tap **Install**, then open **Welcome Abdallah** from the app drawer.

Requires Android 7.0 (API 24) or newer.
