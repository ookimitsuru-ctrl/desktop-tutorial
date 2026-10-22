#!/usr/bin/env bash
# スマホ実機での自動テスト（USBデバッグを有効にしたスマホをケーブル接続して実行）
#
#   ./tools/phone_test.sh WorldStrikers-v1.x.x-release.apk [前後半の分数=2]
#
# 難易度（やさしい/ふつう/むずかしい）× 画質（高/中/低/自動）の組み合わせごとに、
# ボットが1試合を自動でプレーし、ゲーム内で測ったフレーム時間（fps・カクつき）と
# Android の gfxinfo・端末温度を phone_results/日時/ に保存する。
# 前後半2分なら全12試合で約1時間。必要なもの: adb（Android SDK Platform-Tools）
set -u
APK="${1:-}"
HALF="${2:-2}"
PKG=com.worldstrikers.soccer
ACT=$PKG/.MainActivity
if ! command -v adb >/dev/null; then echo "adb が見つかりません（Android SDK Platform-Tools を入れてください）"; exit 1; fi
N=$(adb devices | awk 'NR>1 && $2=="device"' | wc -l)
if [ "$N" -ne 1 ]; then echo "接続中の端末が $N 台です。1台だけ接続し、USBデバッグを許可してください。"; adb devices; exit 1; fi

OUT="phone_results/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"
{
  echo "model: $(adb shell getprop ro.product.model | tr -d '\r')"
  echo "android: $(adb shell getprop ro.build.version.release | tr -d '\r')"
  echo "soc: $(adb shell getprop ro.soc.model | tr -d '\r')"
  echo "screen: $(adb shell wm size | tr -d '\r')"
  echo "gles: $(adb shell dumpsys SurfaceFlinger | grep -m1 GLES | tr -d '\r')"
  echo "webview: $(adb shell dumpsys package com.google.android.webview | grep -m1 versionName | tr -d '\r ')"
} | tee "$OUT/device.txt"

if [ -n "$APK" ]; then
  echo "APK をインストール: $APK"
  adb install -r "$APK" || exit 1
fi

i=0
for diff in easy normal hard; do
  for q in high medium low auto; do
    i=$((i + 1))
    venue=$(( (i - 1) % 4 ))
    weather=clear
    [ $(( i % 3 )) -eq 0 ] && weather=rain
    name="$i-$diff-$q"
    query="autoplay=1&difficulty=$diff&quality=$q&half=$HALF&venue=$venue&weather=$weather&label=phone-$i"
    echo "[$(date +%H:%M:%S)] $name を開始 ($query)"
    adb logcat -c
    adb shell dumpsys gfxinfo $PKG reset >/dev/null 2>&1
    adb shell "am start -S -n $ACT --es query '$query'" >/dev/null
    # 試合終了（summary）まで待つ。前後半＋入場・ハーフタイム・リプレイの余裕を見て上限を決める
    limit=$(( HALF * 2 * 60 * 2 + 180 ))
    t=0
    while [ $t -lt $limit ]; do
      sleep 10
      t=$((t + 10))
      if adb logcat -d -s WSPERF:I | grep -q '"t":"summary"'; then break; fi
    done
    adb logcat -d -s WSPERF:I | sed -n 's/.*WSPERF *: //p' > "$OUT/$name.jsonl"
    adb shell dumpsys gfxinfo $PKG > "$OUT/$name-gfxinfo.txt"
    adb shell dumpsys battery | grep -i temperature | tr -d '\r' > "$OUT/$name-battery.txt"
    if grep -q '"t":"summary"' "$OUT/$name.jsonl"; then
      grep '"t":"summary"' "$OUT/$name.jsonl" | head -1 >> "$OUT/summary.jsonl"
      echo "  完了: $(grep '"t":"summary"' "$OUT/$name.jsonl" | head -1 | cut -c1-220)"
    else
      echo "  時間内に終わりませんでした（$OUT/$name.jsonl を確認）"
    fi
    echo "  gfxinfo: $(grep -m1 'Janky frames' "$OUT/$name-gfxinfo.txt" | tr -d '\r')"
  done
done
adb shell am force-stop $PKG
echo
echo "結果: $OUT （summary.jsonl と各試合のログ）"
echo "このフォルダを Claude に送ると、レポートにまとめます。"
