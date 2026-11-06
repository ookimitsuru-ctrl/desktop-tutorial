# RINGBOUND（闘環）

Android 向けのオリジナル 3D 対戦格闘ゲーム。武術家が操縦する人型の機甲兵（RF）どうしが、P・K・G の 3 ボタン、上中下段、投げ、横移動（回避）、リングアウト、フレーム単位の有利不利で戦う、正統派の 3D 格闘ゲーム。

- 9 機の機甲兵とそのパイロット（空手・システマ・グレコローマン・ラウェイ・形意拳・カリ・サバット・カラリパヤット・古流柔術）。各機 2 種の装備と 4 色の塗装。各キャラ固有のシステム（受け・脱力・連続投げ・首相撲・ジャスト入力・トラップ・ガルド・三獣の構え・当て身）
- 9 ステージ（壁・フェンス・破壊できる壁・リングアウト）
- モード: アーケード（ストーリー・ライバル・ボス）、対戦（CPU / 2P）、トレーニング、チュートリアル 12 課、技トライアル、サバイバル、タイムアタック、CPU 観戦、リプレイ、ギャラリー、実績 30 種
- タッチ操作（フローティングスティック・フリック）、ゲームパッド、キーボード
- 日本語 / 英語

## 遊ぶ

GitHub の Actions → 最新の `ci` 実行 → Artifacts の **`ringbound-debug-apk`** をダウンロードし、zip の中の APK を Android 端末（Android 10 以上・arm64）にインストールする。
署名済みのリリース版の作り方は [`docs/RELEASE.md`](docs/RELEASE.md)。

## 開発

| 項目 | 内容 |
|---|---|
| エンジン | Godot 4.7.2（GDScript、Mobile レンダラー）。バージョンは `tools/versions.env` |
| 仕様書 | [`docs/spec/README.md`](docs/spec/README.md)（実装時の変更点は [`docs/spec/CHANGELOG.md`](docs/spec/CHANGELOG.md)） |
| 開発ログ | [`docs/DEVLOG.md`](docs/DEVLOG.md) |
| 素材台帳・クレジット | [`docs/ASSET_LEDGER.md`](docs/ASSET_LEDGER.md)・[`docs/CREDITS.md`](docs/CREDITS.md) |

### 構成

- `src/sim/` 決定論的シミュレーション（Q16.16 固定小数点、エンジンの物理は使わない）
- `src/anim/` 手続き的アニメーション（IK テンプレート）とベイカー（判定・移動量を `data/baked/` に焼く）
- `src/presentation/` 描画（キャラ・カメラ・ステージ・VFX・HUD・音）
- `src/app/` 画面・モード・セーブ・設定、`src/ai/` CPU
- `data/` ルール・キャラ（技データ・コンボ）・ステージ・物語・実績
- `tools/` モデル生成（SDF）・音の合成・データ作成・検証ツール

### よく使うコマンド

```sh
godot --headless --path . --import                                   # 取り込み（新しいクラスを追加した後も）
godot --headless --path . res://tools/validate/check_scene.tscn      # 全スクリプトのコンパイル検査
godot --headless --path . -s res://tools/bake/bake_all.gd            # アニメと判定のベイク（技データを変えたら必須）
godot --headless --path . -s res://tests/run_tests.gd [-- 名前の一部] # テスト（全技のフレームデータ実測を含む）
godot --headless --path . res://tools/validate/ui_smoke.tscn         # 全画面の実行確認
godot --headless --path . --fixed-fps 60 res://tools/validate/soak.tscn  # CPU 同士の連続試合で解放漏れを確認
xvfb-run -a godot --path . --rendering-driver vulkan res://tools/validate/render_smoke.tscn  # 全シェーダーを実際に描画して確認
godot --headless --path . -s res://tools/validate/combo_search.gd    # コンボの探索（--verify で検証のみ）
godot --headless --path . -s res://tools/validate/balance_report.gd  # CPU 同士の全組み合わせ勝率 → reports/balance.md
# PV（45 秒の宣伝映像）: 撮影（1080p で書き出すには一時的に override.cfg で window_width/height_override を 1920x1080 に）→ 編集
PV_SHOTS=tools/pv/shots.json PV_LOG=raw_log.json xvfb-run -a godot --path . --rendering-driver vulkan --write-movie raw.avi --fixed-fps 30 res://tools/pv/pv_director.tscn
python3 tools/pv/make_pv.py raw.avi raw_log.json build/ringbound_pv.mp4
python3 tools/charmodel/gen_mech.py <id> [a b]                       # 機甲兵のモデルの生成（デザインは character.json の model.mech）
python3 tools/content/build.py [id ...]                              # 灯真以外のキャラデータの生成
```

技データ（`data/characters/<id>/moves.json`）を変えたら、ベイク → テスト → `combo_search --verify` → 必要ならゴールデンリプレイの作り直し（`tools/validate/make_golden.gd`）の順に確認する。
