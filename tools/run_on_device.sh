#!/usr/bin/env bash
# Builds, installs, launches the game on the attached device, then collects the
# things worth looking at after a first run: crashes, GL errors, and real frame
# timings. Everything lands in one file you can hand back.
#
#   tools/run_on_device.sh [capture_seconds]      # default 30
set -euo pipefail

SECONDS_TO_CAPTURE="${1:-30}"
PKG="com.rollerdash.arena.debug"
ACTIVITY="com.rollerdash.arena.MainActivity"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/device-report.txt"

command -v adb >/dev/null || { echo "adb not on PATH (Android SDK platform-tools)"; exit 1; }

DEVICES="$(adb devices | awk 'NR>1 && $2=="device" {print $1}')"
if [ -z "$DEVICES" ]; then
    echo "No authorised device. Check the USB cable, enable USB debugging, and accept"
    echo "the RSA prompt on the phone. 'adb devices' should list it as 'device'."
    adb devices
    exit 1
fi
echo "device(s): $DEVICES"

cd "$ROOT"
./gradlew --console=plain installDebug

{
    echo "==== device ===="
    adb shell getprop ro.product.manufacturer | tr -d '\r'
    adb shell getprop ro.product.model | tr -d '\r'
    echo -n "Android "; adb shell getprop ro.build.version.release | tr -d '\r'
    echo -n "SDK "; adb shell getprop ro.build.version.sdk | tr -d '\r'
    echo "==== gpu ===="
    adb shell dumpsys SurfaceFlinger 2>/dev/null | grep -iE "GLES|EGL" | head -5 | tr -d '\r'
} > "$OUT"

adb logcat -c || true
adb shell am force-stop "$PKG" || true
adb shell am start -n "$PKG/$ACTIVITY" >/dev/null

echo
echo "Launched. Play for ${SECONDS_TO_CAPTURE}s - move, dash, jump, fire all three weapons."
echo "Collecting logs..."
# Crashes, our own GL errors, and anything the app itself logs.
adb logcat -v brief > "$ROOT/.logcat.tmp" 2>/dev/null &
LOG_PID=$!
sleep "$SECONDS_TO_CAPTURE"
kill "$LOG_PID" 2>/dev/null || true
wait "$LOG_PID" 2>/dev/null || true

{
    echo
    echo "==== logcat (filtered) ===="
    grep -iE "RollerDashGL|AndroidRuntime|rollerdash|GLSL|shader|OpenGL|libEGL|Adreno|Mali|PowerVR|FATAL" \
        "$ROOT/.logcat.tmp" | head -200 || echo "(nothing matched - that is the good case)"
    echo
    echo "==== frame timings (dumpsys gfxinfo) ===="
    adb shell dumpsys gfxinfo "$PKG" 2>/dev/null | sed -n '/Total frames rendered/,/^$/p' | tr -d '\r'
    echo
    echo "==== is it still running? ===="
    if adb shell pidof "$PKG" | tr -d '\r' | grep -q .; then
        echo "yes - no crash"
    else
        echo "NO - the process is gone, look at the logcat section above"
    fi
} >> "$OUT"

rm -f "$ROOT/.logcat.tmp"
echo
echo "Wrote $OUT"
echo "----------------------------------------"
tail -40 "$OUT"
