#!/usr/bin/env bash
# Packages SaveMind for Mac (Apple Silicon and Intel) and zips each app. The app is not signed here;
# on the Mac, sign it locally once with: codesign --force --deep --sign - /Applications/SaveMind.app
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
node scripts/copy-web.js
rm -rf dist
npx electron-packager . SaveMind --platform=darwin --arch=arm64,x64 --out=dist --overwrite \
  --icon=assets/icon.icns --app-bundle-id=com.abdallah.savemind --app-version="$VERSION" \
  --app-category-type=public.app-category.productivity \
  --ignore='^/(test|dist|scripts)(/|$)' --ignore='^/assets/icon\.png$' --quiet
for arch in arm64 x64; do
  (cd "dist/SaveMind-darwin-$arch" && zip -qry "../SaveMind-$VERSION-mac-$arch.zip" SaveMind.app)
done
ls -la dist/*.zip
