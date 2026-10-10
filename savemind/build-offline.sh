#!/usr/bin/env bash
# Builds a signed SaveMind APK without Gradle or the Android SDK manager, using the
# Debian/Ubuntu packages: aapt, dalvik-exchange (dx), zipalign, apksigner.
#
#   ANDROID_JAR=/path/to/android-34/android.jar \
#   KEYSTORE=/path/to/key.jks KEYSTORE_PASS=... KEY_ALIAS=... \
#   ./savemind/build-offline.sh [output.apk]
#
# The regular build is `gradle :savemind:assembleRelease` (used by GitHub Actions).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/src/main"
OUT_APK="${1:-$HERE/build/offline/SaveMind.apk}"
WORK="$HERE/build/offline/work"
: "${ANDROID_JAR:?Set ANDROID_JAR to an API 34 android.jar}"
: "${KEYSTORE:?Set KEYSTORE to a signing keystore}"
: "${KEYSTORE_PASS:?Set KEYSTORE_PASS}"
: "${KEY_ALIAS:?Set KEY_ALIAS}"
VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0}"

rm -rf "$WORK"
mkdir -p "$WORK/gen" "$WORK/classes" "$WORK/dex" "$(dirname "$OUT_APK")"

# The source manifest has no package attribute (Gradle supplies the namespace).
sed 's/<manifest /<manifest package="com.abdallah.savemind" /' "$SRC/AndroidManifest.xml" > "$WORK/AndroidManifest.xml"

aapt package -f -m \
  -J "$WORK/gen" \
  -M "$WORK/AndroidManifest.xml" \
  -S "$SRC/res" \
  -A "$SRC/assets" \
  -I "$ANDROID_JAR" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  -0 woff2 \
  -F "$WORK/unsigned.apk"

javac -nowarn -Xlint:-options -encoding UTF-8 -source 8 -target 8 \
  -bootclasspath "$ANDROID_JAR" \
  -d "$WORK/classes" \
  $(find "$SRC/java" "$WORK/gen" -name '*.java')

dalvik-exchange --dex --min-sdk-version=24 --output="$WORK/dex/classes.dex" "$WORK/classes"

(cd "$WORK/dex" && aapt add "$WORK/unsigned.apk" classes.dex > /dev/null)

zipalign -f -p 4 "$WORK/unsigned.apk" "$WORK/aligned.apk"
apksigner sign \
  --ks "$KEYSTORE" --ks-pass "pass:$KEYSTORE_PASS" --ks-key-alias "$KEY_ALIAS" \
  --min-sdk-version 24 \
  --out "$OUT_APK" "$WORK/aligned.apk"
apksigner verify --min-sdk-version 24 "$OUT_APK"
echo "Built $OUT_APK"
