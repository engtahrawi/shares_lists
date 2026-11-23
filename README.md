# Android apps

This repository holds two Android apps:

- **SaveMind** (`savemind/`): AI-assisted link capture and organization, built to the SaveMind PRD v1.0.
- **Welcome Abdallah** (`app/`): the original personal link collector.

## SaveMind

Save links from any app, then let Claude brief, tag and file them.

- **Share capture**: in any app (YouTube, LinkedIn, WhatsApp, Chrome, X, ...) tap **Share** and choose
  **SaveMind**. The link is saved immediately, a small sheet confirms it (with an optional note), and you
  return to the app you were in. Links already saved are flagged, with **View existing** or **Save copy**.
- **Add Link**: paste or type a URL, add optional context, and tap **Save & Analyze**.
- **Background analysis**: SaveMind fetches the public page from the phone (bounded size and time, no
  access to local network addresses, oEmbed for YouTube, TikTok, X and Vimeo), then asks Claude for a
  title, a 1 to 3 sentence brief, content type, topic, tags, a collection suggestion and one recommended
  action. Output is validated against a JSON schema. Each link shows its source level: **Full source**,
  **Partial source** (metadata or shared text only) or **Unavailable** (no content claims are made).
- **Smart Inbox**: review each brief, then **Accept** an existing collection, **Create & save** a suggested
  new collection (never created without approval), **Move**, **Edit** or **Keep in Inbox**.
- **Deadlines**: Claude reads the closing date of an opportunity from the page or the shared text (never
  guessing one). It shows as its own block on the link, color-coded by how close it is, and the nearest three
  appear under **Upcoming deadlines** on Home. You can set, correct or remove a deadline (yours is never
  overwritten) and get a reminder notification 3 days or 1 week before.
- **Home** shows only collections that hold links; empty ones stay in the Collections tab.
- **Collections**, **Favorites**, **Archive**, **Search** (title, brief, tags, URL, collection, notes;
  Arabic-aware) with source and status filters, **Retry** and **Add context** for failed analyses.
- **Settings**: Claude API key (encrypted with the Android Keystore), model choice (Claude Opus 5.5 by
  default, Sonnet 5.5 or Haiku 5.5), brief language (match source, English or Arabic), optional auto-filing
  of strong matches, usage and estimated cost, JSON backup export and import, delete all data.

### Connecting Claude

SaveMind calls the Claude API directly from the phone with your own key. Create a key at
[console.anthropic.com](https://console.anthropic.com/settings/keys), then paste it in **Settings > Claude**
and tap **Test**. Links are always saved, even without a key or connection; analysis starts as soon as a
key and network are available, and retries automatically with backoff.

### Privacy

Links, notes and collections are stored only on the phone (app backup is disabled). For analysis, the
extracted page text, page details, text you shared or wrote, and your collection names are sent to
Anthropic's Claude API. Nothing is sent anywhere else.

### Differences from the PRD architecture

The PRD recommends a backend (FastAPI, PostgreSQL/Supabase, a worker queue) that calls Claude and handles
sign-in. This build is a single-user, on-device MVP: SQLite replaces the server database, an on-device job
queue replaces the worker, and the user's own key replaces the server-side secret. Accounts (FR-14),
iOS, reminders and semantic search are not included.

### Building SaveMind

- **GitHub Actions** builds `SaveMind.apk` next to `WelcomeAbdallah.apk` on every push and publishes both
  under **Releases** when the signing secrets below are set.
- **Locally with Gradle**: `gradle :savemind:assembleDebug`.
- **Without Gradle or the SDK manager**: `savemind/build-offline.sh` builds a signed APK with the Debian
  `aapt`, `dalvik-exchange`, `zipalign` and `apksigner` packages and an API 34 `android.jar`.

## Welcome Abdallah

A personal Android app for collecting links:

- **Welcome screen** showing "Welcome Abdallah" for a moment on launch (tap to skip).
- **My Links home screen**, one page listing every link shared into the app, newest first,
  with search. Tap a link to open it; long-press to share, copy, or delete it.
- **Save to Links share target**: in any app (Chrome, YouTube, WhatsApp, X, ...) tap
  **Share** and choose **Save to Links**. The link is saved and you stay in the app you were using.
  Sharing the same link again moves it back to the top.

## Getting the APKs

Every push runs the **Build APK** GitHub Actions workflow, which builds release APKs signed
with the permanent key and publishes `WelcomeAbdallah.apk` and `SaveMind.apk` under this repository's **Releases**.
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

1. Open the latest release on the phone and download `SaveMind.apk` (or `WelcomeAbdallah.apk`).
2. Open the downloaded file and allow "Install unknown apps" for your browser or file manager when prompted.
3. Tap **Install**, then open the app from the app drawer.

Requires Android 7.0 (API 24) or newer.
