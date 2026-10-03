# WIRED

ワイヤーフレームの宇宙船で戦う、コックピット視点のレールシューティング。
「スターブレード」のようなロックオン一斉射撃を軸に、**音楽と同期する攻撃**・**弾き返すロール**・**時間を減速させるオーバードライブ**を組み合わせた Android（横画面）向けゲームです。

- 描画は自前の WebGL ワイヤーフレームレンダラ（発光ライン・残光トレイル・ブルーム）
- ステージ BGM は `music/` の Python スクリプトでオフライン合成: 1・3 面はメロディックメタル（160BPM）、2 面はテクノ（140BPM、TB-303 風アシッド）、ボス戦はメタル×テクノの専用曲（172BPM、WARNING と同時に切り替わり撃破でフェードアウト）。ロックオン音・ミサイル発射音・ON BEAT 判定は再生中の曲の 16 分音符グリッドに同期
- タイトル曲と効果音は WebAudio による手続き生成
- Android 版は WebView ラッパー（`android/`）。APK は **`dist/WIRED.apk`**（Android 8.0+ / 横画面固定 / 通信権限なし）

## 遊び方（タッチ）

| 操作 | 動作 |
| --- | --- |
| 左画面をドラッグ | 機体の移動（左下に移動スティックを表示。触れた所が中心になるフローティング式） |
| ROLL ボタン（移動スティックの真上、◀ / ▶ で方向指定） | **バレルロール**（無敵 + 触れた敵弾を反射）。移動とは独立 |
| 右画面を長押し → ドラッグ | **ロックオン**（照準を敵に重ねると最大 8 体、オーバードライブ中は 16 体まで多重ロック） |
| 指を離す | ロックした全標的へ**ミサイル一斉発射** |
| 右画面をちょん押し | レーザー 3 連射 |
| 画面下の `FLOW` ボタン | FLOW が満タンの時だけ表示。**オーバードライブ**発動 |

オプションで **エイム速度**・**左利きレイアウト（左右の役割入れ替え）**・振動・難易度・画質を変更できます。

デスクトップ確認用: マウス移動=照準 / 左クリック長押し=ロック / WASD=移動 / Space=ロール / F=オーバードライブ / Esc=ポーズ。

## ゲームシステム（ここがこのゲームの核）

1. **ビート・ロック** — ロック音と発射音は BGM の 16 分音符に量子化され、現在のコードのペンタトニックで鳴ります。多重ロック→一斉発射が“演奏”になります。ロック中に照準リングへ収束する**ビートリング**が重なる瞬間に指を離すと **ON BEAT**（ミサイル威力 1.5 倍 + FLOW 加算）。
2. **グレイズ & リフレクト** — 弾をギリギリでかわす（GRAZE）、ロール中に弾へ触れて跳ね返す（REFLECT、プラズマ弾は大ダメージ）と **FLOW** が溜まります。
3. **オーバードライブ（タイムスリップ）** — FLOW 満タンで発動。世界が減速（プレイヤーは等速）し、ロック上限 16・火力 1.5 倍。BGM は低域フィルタ + テンポ減速で“水中”のようになります。
4. **弱点破壊（ワイヤー・シャッター）** — 大型機・ボスはひし形の弱点を持ち、壊すとメッシュの辺が 1 本ずつ砕けて飛び散ります。
5. **曲がるレール** — 世界を湾曲させるシェーダ相当の投影で、直進のゲーム空間を保ったまま曲がりくねる航路を表現。
6. **弾幕の“読み”** — 自機を中心にしたリング弾幕は**その場待機が正解**、螺旋は動き続ける、弾の壁は穴を探す。プラズマ弾はロックして撃ち落とせます。

ステージは 3 面（OUTER BELT / STATION TRENCH / DREADNOUGHT）。各面末にボス（WARDEN / LEVIATHAN / CORE）。

## ビルド

```bash
npm ci
npm run build          # game/dist に 1 ファイルへバンドル
npm run serve          # http://localhost:8080 でブラウザ確認（?debug で FPS 表示）

# Android APK（要 JDK 17+ と Android SDK: platforms;android-34, build-tools;34.0.0）
tools/build-apk.sh     # → dist/WIRED.apk
```

CI（`.github/workflows/android.yml`）でも APK を生成し、Artifact として取得できます。

APK はデバッグ鍵で署名した個人配布用です（提供元不明のアプリのインストールを許可して導入）。

## BGM の作り直し

```bash
pip install numpy scipy soundfile lameenc
python3 music/stage1.py                                  # → music/out/stage1.wav (約2分)
python3 music/export_game.py stage1 108.0 6.0            # → game/assets/bgm_stage1.ogg
python3 music/stage2.py                                  # → music/out/stage2.wav (約1分)
python3 music/export_game.py stage2 120.0 13.714285714   # → game/assets/bgm_stage2.ogg
python3 music/boss.py                                     # → music/out/boss.wav
python3 music/export_game.py boss 61.395349 5.581395     # → game/assets/bgm_boss.ogg
python3 music/make_preview.py stage2 120.0 13.714285714  # 試聴用 MP3
```

## 構成

```
game/src/        ゲーム本体（gfx=描画 / audio=音 / input=入力 / enemies・bosses・stages / hud …）
game/index.html  エントリ（遊び方オーバーレイを含む）
android/         WebView ラッパー（横画面固定・没入表示・最大リフレッシュレート要求・振動ブリッジ）
tools/           ビルド・確認用スクリプト（shot.js はヘッドレス Chromium でのスクリーンショット）
```
