# スマホ実機での自動テスト（Windows / PowerShell 版。内容は phone_test.sh と同じ）
# ※ Windows PowerShell 5.1 で日本語が文字化けしないよう、このファイルは BOM 付き UTF-8 で保存している
#
#   powershell -ExecutionPolicy Bypass -File tools\phone_test.ps1 WorldStrikers-v1.x.x-release.apk [前後半の分数=2]
#
# 難易度（やさしい/ふつう/むずかしい）× 画質（高/中/低/自動）の組み合わせごとに、
# ボットが1試合を自動でプレーし、ゲーム内で測ったフレーム時間（fps・カクつき）と
# Android の gfxinfo・端末温度を phone_results\日時\ に保存する。
# 前後半2分なら全12試合で約1時間。必要なもの: adb（Android SDK Platform-Tools）
param([string]$Apk = "", [int]$Half = 2)
$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Pkg = "com.worldstrikers.soccer"
$Act = "$Pkg/.MainActivity"
if (-not (Get-Command adb -ErrorAction SilentlyContinue)) { Write-Host "adb が見つかりません（Android SDK Platform-Tools を入れてください）"; exit 1 }
$devs = (adb devices) | Select-Object -Skip 1 | Where-Object { $_ -match "\tdevice$" }
if (@($devs).Count -ne 1) { Write-Host "接続中の端末が $(@($devs).Count) 台です。1台だけ接続し、USBデバッグを許可してください。"; adb devices; exit 1 }

$Out = "phone_results\" + (Get-Date -Format "yyyyMMdd-HHmmss")
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$info = @(
  "model: " + (adb shell getprop ro.product.model)
  "android: " + (adb shell getprop ro.build.version.release)
  "soc: " + (adb shell getprop ro.soc.model)
  "screen: " + (adb shell wm size)
  "gles: " + ((adb shell dumpsys SurfaceFlinger) | Select-String -Pattern "GLES" | Select-Object -First 1)
)
$info | Set-Content -Encoding UTF8 "$Out\device.txt"
$info | ForEach-Object { Write-Host $_ }

if ($Apk -ne "") {
  Write-Host "APK をインストール: $Apk"
  adb install -r $Apk
  if ($LASTEXITCODE -ne 0) { exit 1 }
}

$i = 0
foreach ($diff in @("easy", "normal", "hard")) {
  foreach ($q in @("high", "medium", "low", "auto")) {
    $i++
    $venue = ($i - 1) % 4
    $weather = if ($i % 3 -eq 0) { "rain" } else { "clear" }
    $name = "$i-$diff-$q"
    $query = "autoplay=1&difficulty=$diff&quality=$q&half=$Half&venue=$venue&weather=$weather&label=phone-$i"
    Write-Host "[$(Get-Date -Format HH:mm:ss)] $name を開始 ($query)"
    adb logcat -c
    adb shell dumpsys gfxinfo $Pkg reset | Out-Null
    adb shell "am start -S -n $Act --es query '$query'" | Out-Null
    $limit = $Half * 2 * 60 * 2 + 180
    $t = 0
    while ($t -lt $limit) {
      Start-Sleep -Seconds 10
      $t += 10
      if ((adb logcat -d -s WSPERF:I) -match '"t":"summary"') { break }
    }
    $lines = (adb logcat -d -s WSPERF:I) | ForEach-Object { if ($_ -match 'WSPERF\s*:\s(.*)$') { $Matches[1] } }
    $lines | Set-Content -Encoding UTF8 "$Out\$name.jsonl"
    adb shell dumpsys gfxinfo $Pkg | Set-Content -Encoding UTF8 "$Out\$name-gfxinfo.txt"
    (adb shell dumpsys battery) | Select-String -Pattern "temperature" | Set-Content -Encoding UTF8 "$Out\$name-battery.txt"
    $summary = $lines | Where-Object { $_ -match '"t":"summary"' } | Select-Object -First 1
    if ($summary) {
      Add-Content -Encoding UTF8 "$Out\summary.jsonl" $summary
      Write-Host "  完了: $($summary.Substring(0, [Math]::Min(220, $summary.Length)))"
    } else {
      Write-Host "  時間内に終わりませんでした（$Out\$name.jsonl を確認）"
    }
    $jank = Get-Content "$Out\$name-gfxinfo.txt" | Select-String -Pattern "Janky frames" | Select-Object -First 1
    Write-Host "  gfxinfo: $jank"
  }
}
adb shell am force-stop $Pkg
Write-Host ""
Write-Host "結果: $Out （summary.jsonl と各試合のログ）"
Write-Host "このフォルダを Claude に送ると、レポートにまとめます。"
