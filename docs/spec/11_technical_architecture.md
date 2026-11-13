# 11 技術アーキテクチャ

## 11.1 技術スタック

| 項目 | 採用 | 理由 |
|---|---|---|
| エンジン | **Godot Engine 4.5 系 stable**（着手時点の最新 4.x stable のパッチ版を `GODOT_VERSION` として固定） | オープンソース・ヘッドレスでのビルド/テスト/エクスポートが可能・テキスト形式のシーン（AI が編集しやすい）・Android Vulkan 対応 |
| 言語 | GDScript（静的型付け必須） | エンジン標準、Android エクスポートが安定、ビルド不要 |
| レンダラ | Mobile（Vulkan）＋ Compatibility（GLES3）への自動フォールバック | |
| テスト | GUT（Godot Unit Test, MIT） | ヘッドレス CLI 実行が可能 |
| アセット | Blender 4.x LTS（ヘッドレス Python） | 再現可能なアセット生成 |
| CI/CD | GitHub Actions | APK の自動ビルドと配布 |
| Android ビルド | JDK 17、Android SDK（cmdline-tools / platform-tools / build-tools）、Godot 公式エクスポートテンプレート | |

- **バージョン固定**: Godot・エクスポートテンプレート・GUT・Blender のバージョンは `tools/versions.env` に記載し、CI とローカル手順はこれを参照する。途中でのメジャー/マイナー更新は禁止（パッチ更新は CHANGELOG に記録した上で可）。
- 使用するエンジン機能は、固定したバージョンで実在することを確認してから使う（本書に書かれた機能名がそのバージョンに無い場合は、同等の自前実装に置き換え CHANGELOG に記録する）。

## 11.2 リポジトリ構成

```
/
├─ project.godot
├─ export_presets.cfg                 # Android プリセット（パスワード類は含めない）
├─ .github/workflows/                 # ci.yml / nightly.yml / release.yml
├─ addons/gut/                        # GUT（MIT）
├─ src/
│  ├─ sim/                            # ★決定論シミュレーション（Node・エンジンAPI非依存）
│  │  ├─ core/        fp.gd, fp_vec2.gd, fp_vec3.gd, trig_table.gd(生成), rng.gd, checksum.gd
│  │  ├─ input/       input_frame.gd, input_history.gd, command_parser.gd, command_spec.gd
│  │  ├─ fighter/     fighter_state.gd, state_machine.gd, states/*.gd, move_runner.gd, posture.gd
│  │  ├─ combat/      collision.gd, hit_resolver.gd, throw_system.gd, evade_rules.gd,
│  │  │               damage.gd, juggle.gd, stun.gd, stagger.gd, down_game.gd
│  │  ├─ stage/       ring.gd, boundary.gd, wall_state.gd
│  │  ├─ match/       sim_world.gd, round_rules.gd, sim_events.gd, camera_side.gd
│  │  └─ data/        char_def.gd, move_def.gd, stage_def.gd, data_db.gd, baked_data.gd
│  ├─ ai/                             # AI（シミュレーションを読み取り専用で参照）
│  ├─ presentation/                   # 描画・音・HUD（シミュレーションを読み取り専用で参照）
│  │  ├─ fighter_view/  camera/  vfx/  audio/  stage_view/  hud/
│  ├─ app/                            # アプリ層（モード、画面、セーブ、入力デバイス）
│  │  ├─ autoload/  match/  modes/  ui/
│  └─ net/                            # オンライン（v1.x）
├─ data/
│  ├─ common/                         # rules.json, common_moves.json, hit_reactions.json
│  ├─ characters/<id>/                # character.json, moves.json, combos.json, trials.json,
│  │                                  # ai_playbook.json, poses.json, anims/*.pose.json
│  ├─ stages/<id>.json
│  ├─ story/<id>.json, achievements.json
│  └─ baked/<id>/                     # ★生成物（コミットする）: index.json, hurt.bin, hit.bin, motion.bin, throw.bin
├─ assets/                            # characters/ stages/ vfx/ audio/ fonts/ ui/
├─ shaders/
├─ i18n/strings.csv
├─ tools/
│  ├─ versions.env
│  ├─ blender/                        # モデル・衣装・テクスチャ生成
│  ├─ anim_builder/                   # ポーズDSL → Animation
│  ├─ bake/                           # 判定・移動カーブのベイク
│  ├─ validate/                       # データ検証（スキーマ・フレームデータ・必須カテゴリ）
│  ├─ headless_runner/                # 自動対戦・ベンチマーク
│  ├─ review/                         # Movie Maker 書き出し
│  └─ gen/                            # 三角関数テーブル等のコード生成
├─ tests/                             # unit/ integration/ replays/(ゴールデン) perf/
├─ reports/                           # 生成レポート（summary のみコミット）
└─ docs/                              # spec/（本書）, ASSET_LEDGER.md, CREDITS.md, DEVLOG.md
```

## 11.3 プロジェクト設定（必須値）

| キー | 値 | 目的 |
|---|---|---|
| `application/config/name` | `RINGBOUND` | |
| `application/run/max_fps` | `60` | 描画を 60fps に固定 |
| `display/window/vsync/vsync_mode` | 有効 | |
| `display/window/size/viewport_width` / `height` | `1280` / `720` | UI の論理解像度 |
| `display/window/stretch/mode` / `aspect` | `canvas_items` / `expand` | 画面比率差を吸収 |
| `display/window/handheld/orientation` | センサー横向き | |
| `display/window/energy_saving/keep_screen_on` | `true` | |
| `application/config/quit_on_go_back` | `false` | 戻る＝ポーズ |
| `rendering/renderer/rendering_method`（mobile 含む） | `mobile` | |
| `rendering/rendering_device/fallback_to_opengl3` | `true` | Vulkan 非対応端末で GLES3 へ |
| `rendering/textures/vram_compression/import_etc2_astc` | `true` | モバイル向け圧縮 |
| `rendering/scaling_3d/mode` / `scale` | プリセットで切替（bilinear または FSR1 / 0.6〜1.0） | |
| `input_devices/pointing/emulate_mouse_from_touch` | `false` | |
| `input_devices/pointing/emulate_touch_from_mouse` | `true` | デスクトップ検証 |
| `audio/driver/output_latency` | `15` | 低遅延 |
| `debug/gdscript/warnings/untyped_declaration` | エラー | 静的型付けの強制 |
| `debug/gdscript/warnings/unsafe_*` | 警告 | |
| Android フレームペーシング（Swappy） | 有効（エンジン対応版） | 60fps の安定 |

## 11.4 レイヤー構造（最重要）

```
┌──────────────────────── app（アプリ層） ────────────────────────┐
│  SceneRouter / Modes / UI / SaveData / Settings / InputHub        │
│        │ MatchConfig                     ▲ 結果                    │
│        ▼                                 │                         │
│  MatchDirector ── MatchClock（Tick 数決定）                          │
│        │ InputFrame×2（人/AI/リプレイ/ネット）                        │
│        ▼                                                           │
│  ┌──────────── sim（決定論シミュレーション） ────────────┐          │
│  │ SimWorld.step(inputs) → 状態更新 + SimEvents           │          │
│  │ save_state() / load_state() / checksum()               │          │
│  └─────────────────────────────────────────────────────────┘          │
│        │ 読み取り専用（状態・イベント）                                 │
│        ▼                                                           │
│  presentation（FighterView / CameraRig / VFX / Audio / HUD）          │
└─────────────────────────────────────────────────────────────────┘
```

**依存のルール（違反は CI で検出してビルド失敗）**:

1. `src/sim/` は `src/sim/` 以外のコードに依存しない。`Node`、`SceneTree`、autoload、`Time`、`OS`、`Engine`、`Input`、`ResourceLoader` を使わない（データは `DataDB` が読み込んだ不変オブジェクトを引数で受け取る）。
2. `src/sim/` で浮動小数点（`float` 型、小数リテラル、`sin`/`cos`/`sqrt`/`pow` 等の組み込み数学関数、`randf`/`randi` 等のグローバル乱数）を使わない。
3. `src/presentation/` と `src/ai/` はシミュレーション状態を **読むだけ**。書き込まない。
4. 入力の出所（タッチ・パッド・AI・リプレイ・ネットワーク）の違いは `InputFrame` を作るところで吸収し、シミュレーションは区別しない。

CI のリンター（`tools/validate/lint_sim.gd`）が `src/sim/**/*.gd` を走査し、禁止トークン（`float`, `Node`, `get_tree`, `Time.`, `OS.`, `Engine.`, `Input.`, `randf`, `randi`, `sin(`, `cos(`, `sqrt(`, `pow(`, `load(`, `preload(` など、および `\d+\.\d+` の小数リテラル）を検出したら失敗させる。

## 11.5 メインループとタイミング

- 描画は 60fps 固定。**原則「1描画フレーム = 1 シミュレーション Tick」**。
- `MatchClock` は前フレームからの経過時間 Δ を測り:
  - 通常（Δ ≤ 25ms）: 1 Tick
  - フレーム落ち（Δ > 25ms）: `round(Δ / 16.667ms)` Tick（最大 3）で追いつく
  - 長時間の停止（Δ > 100ms、アプリ復帰など）: 追いつかず 1 Tick（ゲームがスローになったとみなす）
  - 1秒ごとに「実時間とTick数」のずれを測り、±1 Tick の範囲で補正する
- 1 Tick の処理順:
  1. `InputHub` から各プレイヤーの `InputFrame` を取得（AI はここで推論）
  2. `SimWorld.step(inputs)`
  3. リプレイ記録・（オンライン時）入力送信
- 描画フレームの最後に `Presentation.update(world, events)` を1回だけ呼ぶ（複数 Tick を処理したフレームでもイベントは全て渡す）。
- 120Hz/90Hz 端末: `max_fps = 60` とフレームペーシングで 60fps に揃える。可能な端末では Android プラグイン（v1.0 の M5 で追加、Gradle ビルド）からディスプレイモードを 60Hz に切り替える要求を出す（`preferredDisplayModeId`）。不可能な端末では 60fps 上限のまま動作する。
- トレーニングの低速再生（0.5 / 0.25 倍）は「2 / 4 描画フレームに 1 Tick」で実現する。フレーム送りは「ボタン押下で 1 Tick」。

## 11.6 決定論と固定小数点

### 11.6.1 数値表現

| 種類 | 表現 | 範囲・精度 |
|---|---|---|
| 長さ・位置・速度 | Q16.16（`int`、1.0 = 65536） | ±32768m、精度 0.015mm |
| 角度 | 16bit 2進角（0〜65535） | 0.0055° |
| 割合・係数 | Q16.16 | |
| フレーム・ダメージ・体力 | 素の整数 | |

- 乗算 `FP.mul(a, b) = (a * b) >> 16`、除算 `FP.div(a, b) = (a << 16) / b`（GDScript の int は 64bit。中間値のオーバーフローが起きない範囲で使う。テストで境界値を確認する）。
- 三角関数: `sin` の 4096 要素テーブル（Q16.16）を `tools/gen/gen_trig_table.py` で生成し、`src/sim/core/trig_table.gd` に定数配列として **コミット**。`cos` は位相シフト。
- `atan2`: 八分円分割＋1024要素テーブル。`sqrt`: 64bit 整数の二分法/ニュートン法。
- 端数処理は常に「0方向への切り捨て」（GDScript の整数除算の挙動）で統一し、ダメージ補正などの丸めは仕様書の記述どおり切り捨てとする。

### 11.6.2 決定論のルール

- 乱数: `src/sim/core/rng.gd`（PCG32）。シード・状態はシミュレーション状態に含める。AI は別ストリーム（試合シードから派生）。
- 処理順: 両プレイヤーを **対称に** 処理する。判定は「両者の判定前状態」から同時に計算し、結果をまとめて適用する（P1 を先に処理することによる有利不利を作らない）。
- コレクション: シミュレーション内の繰り返しは `Array` / `Packed*Array` の添字順のみ。`Dictionary` を走査しない。
- データ: JSON から読み込んだ数値は読み込み時に整数（Q16.16）へ変換する。JSON 上の小数（例 `0.7`）は **10進文字列から整数演算で変換** する（浮動小数点を経由しない変換関数 `FP.from_decimal_string()` を用意し、`JSON.parse` の float 値は使わない。そのため数値フィールドはスキーマ上「小数を含む場合は文字列」とする — [12 §12.1](12_data_formats.md)）。
- ベイク済みデータ（判定・移動カーブ）はコミットされたバイナリを正とする（[09 §9.6](09_art_animation_camera_vfx.md)）。

### 11.6.3 チェックサム

- `SimWorld.checksum()`: 全シミュレーション状態の整数列に対する FNV-1a（32bit）。
- デバッグビルド: 毎フレーム計算してリプレイに 60F ごとに記録。リプレイ再生時に照合し、不一致なら即座にエラー表示（決定論バグの早期検出）。
- テスト: [15 §15.3](15_qa_and_testing.md)。

## 11.7 シミュレーションの1Tick（`SimWorld.step`）

| # | フェーズ | 内容 |
|---|---|---|
| 1 | 入力取り込み | `InputFrame` を履歴に追加。`camera_side` を更新し、画面基準の方向を自分基準へ変換 |
| 2 | ヒットストップ | `hitstop > 0` なら減算し、入力履歴の記録のみ行ってフェーズ 9 へ |
| 3 | コマンド解決 | 各ファイターについて、行動可能・連携受付・先行入力受付のいずれかなら、コマンドパーサーで技/行動を決定（両者とも同じ判定前状態から） |
| 4 | 状態更新 | 決定した遷移の適用、状態内フレームの進行、技の進行、追尾による向きの更新 |
| 5 | 移動 | 歩き・ダッシュ・技の移動カーブ（ベイク済み）・空中物理（重力・浮き） |
| 6 | 押し合い・境界 | 押し合い解決、壁/柵/縁の制約、リングアウト判定 |
| 7 | 投げ解決 | 発生フレームの投げの成立判定・投げ抜け・投げ合い |
| 8 | 打撃解決 | 判定（[02 §2.13.2](02_combat_system.md)）、ヒット/ガード/カウンター/相打ちの確定、ダメージ・硬直・リアクション・ヒットストップ・浮きの適用 |
| 9 | 後処理 | 壁ヒット、よろけのレバガチャ、ダウン/受け身、KO・リングアウト・タイムアップ判定、タイマー、イベント発行、フレーム番号 +1 |

## 11.8 状態の表現とスナップショット（ロールバック対応を最初から）

- `FighterState`、`WorldState`（タイマー、ラウンド、ヒットストップ、乱数、壁の状態、カメラ側、イベント連番）は **整数フィールドだけ** を持つ型付きクラスとする。参照（オブジェクト）を持たない。技は `move_index`（整数）で参照する。
- 各クラスは `write_to(buf: PackedInt32Array) -> void` / `read_from(buf: PackedInt32Array, offset: int) -> int` を持つ。これらは **フィールド定義表（クラス先頭の定数配列）から自動生成** するか、ユニットテストで「`get_property_list()` に現れる全スクリプト変数がシリアライズ対象に含まれていること」を検証する（フィールド追加時の書き忘れ防止）。
- `SimWorld.save_state() -> PackedInt32Array` / `load_state(buf)`: 全状態のコピー。目標: 1回 ≤ 0.05ms。
- 入力履歴もシミュレーション状態の一部としてスナップショットに含める（直近 60F のリングバッファ）。
- 演出層は、状態が巻き戻っても破綻しないよう「現在の状態から見た目を決める」作りにする（イベントの重複排除は [09 §9.9.2](09_art_animation_camera_vfx.md)）。

## 11.9 データの読み込み

- 起動時に `DataDB`（autoload、app 層）が `data/` 以下の JSON と `data/baked/` のバイナリを読み込み、検証し、**不変の定義オブジェクト**（`CharDef`、`MoveDef`、`StageDef` …）を構築する。シミュレーションはこれを引数で受け取る。
- デバッグビルドでは全検証（スキーマ、フレームデータ整合、必須カテゴリ、ベイクとの整合）を実行し、エラーがあれば画面に一覧表示して停止する。リリースビルドでは CI で検証済みのため軽量チェックのみ。
- データのハッシュ（全 JSON とベイクの SHA-256 をまとめたもの）を計算し、リプレイ・オンラインの互換性チェックに使う。
- デスクトップのデバッグビルドでは F5 でデータを再読み込み（トレーニング中に技の数値を調整して即確認）。

## 11.10 autoload（シングルトン）

| 名前 | 責務 |
|---|---|
| `Log` | ログ出力（レベル別、`user://logs/` にローテーション保存、最大 5 ファイル × 1MB） |
| `Settings` | 設定の読み書き・変更通知 |
| `SaveData` | プロフィール・解禁・記録・リプレイ管理（原子的書き込み、[06 §6.11](06_game_modes_and_progression.md)） |
| `DataDB` | ゲームデータの読み込みと提供 |
| `InputHub` | 入力デバイスの管理、タッチUI状態、`InputFrame` の生成 |
| `AudioHub` | BGM・SE・ボイスの再生、バス管理 |
| `SceneRouter` | 画面遷移、非同期ロード（`ResourceLoader.load_threaded_request`）、トランジション |
| `Game` | セッション状態（選択中のモード・キャラ・設定の受け渡し） |

## 11.11 シーン構成

```
Boot.tscn            … 設定読み込み、DataDB 初期化、端末ティア判定 → Title
Title.tscn / MainMenu.tscn / CharacterSelect.tscn / StageSelect.tscn / VsScreen.tscn / Result.tscn …
Match.tscn
 ├─ MatchDirector（ラウンド進行、モード固有ルールのフック）
 ├─ StageView（ステージのインスタンス、壁の表示状態、環境演出）
 ├─ FighterView ×2（モデル、AnimationTree、揺れ物、表情、ゴースト）
 ├─ CameraRig（通常カメラ、特殊カメラ、揺れ）
 ├─ VfxRouter / AudioRouter（イベント → プール）
 ├─ HUD（CanvasLayer）
 ├─ TouchControls（CanvasLayer、最前面）
 └─ DebugOverlay（デバッグビルドのみ）
```

## 11.12 デバッグ機能（デバッグビルドのみ）

| 機能 | 操作 | 内容 |
|---|---|---|
| オーバーレイ | F1 / 3本指長押し | FPS、フレームタイムグラフ、シミュレーション時間、描画時間、メモリ、両者の状態名・状態内フレーム・技ID |
| 判定表示 | F2 | 押し合い・喰らい・攻撃判定・投げ間合いの可視化 |
| フレーム送り / 一時停止 | F3 / F4 | |
| データ再読み込み | F5 | デスクトップのみ |
| 状態ダンプ | F6 | 現在フレームのスナップショットとチェックサムをファイルへ |
| 入力遅延計測 | 設定 | 入力受信→描画提出のフレーム数を記録・統計表示 |

## 11.13 ヘッドレスランナー

`tools/headless_runner/run.gd` は描画なしでシミュレーション（＋AI）を実行する。

```
godot --headless -s res://tools/headless_runner/run.gd -- \
  --mode=selfplay --p1=toma --p2=zaw --stage=arena --games=200 --seed=1 --level=8 \
  --out=reports/balance/run.csv
godot --headless -s res://tools/headless_runner/run.gd -- --mode=replay --file=tests/replays/x.rbr --expect-checksum
godot --headless -s res://tools/headless_runner/run.gd -- --mode=bench --frames=100000
```

## 11.14 ビルド・CI/CD（GitHub Actions）

### 11.14.1 ワークフロー

| ワークフロー | トリガー | ジョブ |
|---|---|---|
| `ci.yml` | push / PR | ① Godot と GUT の準備（キャッシュ）② `godot --headless --import` ③ リンター（§11.4）④ データ検証 ⑤ GUT（unit / integration）⑥ ゴールデンリプレイ ⑦ ベイク一致確認 ⑧ Android デバッグ APK のエクスポート → **成果物としてアップロード** |
| `nightly.yml` | 毎日 / 手動 | 自動対戦バランスレポート、決定論の長時間テスト、ベンチマーク、レビュー動画の書き出し（任意） |
| `release.yml` | タグ `v*` | 署名済みリリース APK をビルドし GitHub Release に添付 |

### 11.14.2 Android エクスポートの手順（CI の中身）

1. JDK 17 をセットアップ。
2. Android SDK の cmdline-tools を導入し、`platform-tools`、エンジンが要求する `build-tools` と `platforms` を `sdkmanager` でインストール（バージョンは `tools/versions.env`）。
3. Godot 本体（Linux x86_64）とエクスポートテンプレート（`.tpz`）をダウンロードし、テンプレートを `~/.local/share/godot/export_templates/<version>/` に展開。
4. エディタ設定ファイル（`~/.config/godot/editor_settings-4.x.tres`）に `export/android/android_sdk_path` と `export/android/java_sdk_path` を書き込む。
5. キーストア: デバッグ用は CI 内で `keytool` で生成。リリース用は GitHub Secrets（Base64 化したキーストア、エイリアス、パスワード）から復元し、環境変数 `GODOT_ANDROID_KEYSTORE_RELEASE_PATH` / `_USER` / `_PASSWORD`（デバッグは `_DEBUG_` 版）で渡す。**キーストアとパスワードはリポジトリにコミットしない。**
6. バージョン: `versionCode` = `GITHUB_RUN_NUMBER`、`versionName` = タグ（例 `1.0.0`）または `0.<マイルストーン>.<run>` を `export_presets.cfg` に書き込んでからエクスポート。
7. `godot --headless --export-debug "Android" build/ringbound-debug.apk`（リリースは `--export-release`）。
8. APK を `actions/upload-artifact` でアップロード（保持 14日）。

### 11.14.3 エクスポートプリセット（Android）

| 項目 | 値 |
|---|---|
| パッケージ名 | `io.github.ookimitsuru.ringbound` |
| アプリ名 | RINGBOUND |
| アーキテクチャ | arm64-v8a（検証用に x86_64 を別プリセット） |
| 最小 SDK | 29（Android 10） |
| ターゲット SDK | エンジン既定（Google Play 公開時は最新要件に合わせる） |
| 権限 | `VIBRATE` のみ（オンライン実装時に `INTERNET` を追加） |
| 没入モード | ON |
| 画面 | 横向き（センサー） |
| アイコン | 192/432px（アダプティブアイコンの前景・背景を用意） |
| Gradle ビルド | M0〜M4 は使わない。M5 で Android プラグイン（リフレッシュレート）を入れる場合に有効化 |
| 16KB ページサイズ | 対応済みのエンジン/テンプレートを使用（Play 公開の要件） |

### 11.14.4 インストール方法（オーナー向け）

1. GitHub の Actions → 最新の成功した `ci` 実行 → Artifacts から `ringbound-debug-apk` をダウンロード（またはリリースページの APK）。
2. Android 端末で「提供元不明のアプリのインストール」を、使用するファイルマネージャー/ブラウザに許可。
3. APK を開いてインストール。更新時は同じ署名の APK を上書きインストール（デバッグ版とリリース版は署名が異なるため併用不可。切り替える時はアンインストールが必要）。

## 11.15 コーディング規約

- Godot 公式の GDScript スタイルガイドに従う。識別子は英語、コメントは日本語可。
- **全ての変数・引数・戻り値に型を付ける**（`untyped_declaration` をエラー化）。
- シミュレーションのクラスは `class_name` を付け、`RefCounted` を継承（`Node` 不可）。
- 1ファイル 600 行以内を目安、1関数 60 行以内を目安。
- マジックナンバー禁止: ルール値は `data/common/rules.json` に置き、`RulesDef` から参照。
- ドキュメンテーションコメント（`##`）を公開関数に付ける。
- シグナルは app/presentation 層のみで使用（シミュレーションはイベントキュー）。
- 試合中（`Match.tscn` 動作中）のメモリ確保を最小化: エフェクト・音・UI 要素はプール、配列は事前確保して再利用。
- エラー処理: データ不整合は起動時に検出して停止（デバッグ）/ ログ＋安全な既定値（リリース）。試合中に例外的状況が起きた場合はアサートではなくログを残してラウンドを継続する。
