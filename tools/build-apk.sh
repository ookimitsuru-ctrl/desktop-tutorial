#!/usr/bin/env bash
# Web ゲームをビルドして Android APK (release, 署名済み) を dist/StarWire.apk に出力する
set -euo pipefail
cd "$(dirname "$0")/.."
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
[ -f android/local.properties ] || echo "sdk.dir=$ANDROID_HOME" > android/local.properties
npm run build
(cd android && ./gradlew assembleRelease --no-daemon)
mkdir -p dist
cp android/app/build/outputs/apk/release/app-release.apk dist/StarWire.apk
ls -la dist/StarWire.apk
