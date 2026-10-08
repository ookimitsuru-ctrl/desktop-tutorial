# WIRED

ワイヤーフレームの宇宙船で戦う、コックピット視点のレールシューティング。
「スターブレード」のようなロックオン一斉射撃を軸に、**音楽と同期する攻撃**・**弾き返すロール**・**時間を減速させるオーバードライブ**を組み合わせた Android（横画面）向けゲームです。

- 描画は自前の WebGL ワイヤーフレームレンダラ（発光ライン・残光トレイル・ブルーム）
- ステージ BGM は `music/` の Python スクリプトでオフライン合成: 1 面はメロディックメタル（160BPM）、2 面はテクノ（140BPM、TB-303 風アシッド）、3 面（ワープ）はドラムンベース（174BPM、リース・ベース、冒頭の上昇スイープがワープ突入演出と同期）、4 面はパンク（190BPM、D メジャー、フォルマント合成の群衆コール「VIC-TO-RY!」入り。旧オーケストラ版は `music/stage3_orchestra.py`）、ボス戦はメタル×テクノの専用曲（172BPM、WARNING と同時に切り替わり撃破でフェードアウト）。ロックオン音・ミサイル発射音・ON BEAT 判定は再生中の曲の 16 分音符グリッドに同期
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

難易度（`game/src/enemies.js` の `DIFF`）: EASY = 以前の NORMAL 相当、NORMAL = 以前の NORMAL と HARD の間、HARD = 以前の HARD より攻撃頻度・敵の耐久・編隊数を上げ、被弾後の無敵時間も短め。敵弾の速さは EASY ×1.0 / NORMAL ×1.35 / HARD ×1.6。被ダメージは全難易度で以前の 1.5 倍（敵弾 1 発で EASY 約 26 / NORMAL 約 30 / HARD 約 40）。

デスクトップ確認用: マウス移動=照準 / 左クリック長押し=ロック / WASD=移動 / Space=ロール / F=オーバードライブ / Esc=ポーズ。

## ゲームシステム（ここがこのゲームの核）

1. **ビート・ロック** — ロック音と発射音は BGM の 16 分音符に量子化され、現在のコードのペンタトニックで鳴ります。多重ロック→一斉発射が“演奏”になります。ロック中に照準リングへ収束する**ビートリング**が重なる瞬間に指を離すと **ON BEAT**（ミサイル威力 1.5 倍 + FLOW 加算）。
2. **グレイズ & リフレクト** — 弾をギリギリでかわす（GRAZE）、ロール中に弾へ触れて跳ね返す（REFLECT、プラズマ弾は大ダメージ）と **FLOW** が溜まります。
3. **オーバードライブ（タイムスリップ）** — FLOW 満タンで発動。世界が減速（プレイヤーは等速）し、ロック上限 16・火力 1.5 倍。BGM は低域フィルタ + テンポ減速で“水中”のようになります。
4. **弱点破壊（ワイヤー・シャッター）** — 大型機・ボスはひし形の弱点を持ち、壊すとメッシュの辺が 1 本ずつ砕けて飛び散ります。
5. **曲がるレール** — 世界を湾曲させるシェーダ相当の投影で、直進のゲーム空間を保ったまま曲がりくねる航路を表現。
6. **弾幕の“読み”** — 自機を中心にしたリング弾幕は**その場待機が正解**、螺旋は動き続ける、弾の壁は穴を探す。プラズマ弾はロックして撃ち落とせます。

ステージは 4 面（OUTER BELT / STATION TRENCH / HYPERSPACE / DREADNOUGHT）。各面末にボス（WARDEN / LEVIATHAN / MAELSTROM / CORE）。

3 面 HYPERSPACE はワープ空間。開始と同時に星が一気に伸びて超高速の光の筋になり、敵機は出ず、高速で迫る小惑星（岩の壁・巨大岩・横切る岩列・ジグザグに進路と速さを変える紫の岩・回復を落とす彗星）を避けて進みます。岩の数は他の面の 7 割、当たり判定は見た目より少し小さく、衝突ダメージも軽め。小惑星は破壊できず（撃つと弾かれる・ロックオン不可）、すれすれでかわすと GRAZE で FLOW とスコアが入ります。撃てるのは回復や FLOW を落とす彗星と、中盤（約 35〜45 秒、この間は岩が来ない）とボス戦の直前（92 秒頃）に現れる緑の補給機（撃たずに並走し、撃ち落とすとシールド回復 +30 を落とす）だけ（ボス MAELSTROM の投げる岩・散弾も破壊不可、周回する岩の盾は撃てます）。星の見かけの速さ（約 880）と岩が迫る速さ（120）を分けているので、景色は超高速のまま反応できる速さを保っています。ボス MAELSTROM は背後から自機を追い越して現れる岩塊要塞で、周回する岩の盾を投げつけ、穴あきの岩の散弾を浴びせてきます。

4 面のボスを倒すとエンディング映像（約 22 秒 + THE END）。自機（両翼の上下にプロペラントタンク 4 本）が母艦（巨大戦艦）の船腹から離れて並走しながらロールし、艦首の脇で一回転しながら母艦のはるか上空へ上昇（画面上で母艦と重ならない）、加速してカメラのすぐ上を通り過ぎて THE END、続いて戦績。曲は「勇者の帰還」をイメージしたオーケストラ（`music/ending.py`、E♭ メジャー）で、自機がカメラの脇を通り過ぎる瞬間が曲の全奏の頭（22.0 秒）に合わせてあります。タップ / 戻るボタンで THE END まで飛ばせます。

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
python3 music/warp.py                                    # → music/out/warp.wav (3 面ワープ)
python3 music/export_game.py warp 120.0 12.413793        # → game/assets/bgm_warp.ogg
python3 music/stage3.py                                  # → music/out/stage3.wav (4 面)
python3 music/export_game.py stage3 120.0 5.052632       # → game/assets/bgm_stage3.ogg
python3 music/ending.py                                  # → music/out/ending.wav (エンディング、ループなし)
python3 music/export_game.py ending 40.25 -1             # → game/assets/bgm_ending.ogg
python3 music/boss.py                                     # → music/out/boss.wav
python3 music/export_game.py boss 61.395349 5.581395     # → game/assets/bgm_boss.ogg
python3 music/make_preview.py stage2 120.0 13.714285714  # 試聴用 MP3
```

## 構成

```
game/src/        ゲーム本体（gfx=描画 / audio=音 / input=入力 / enemies・bosses・stages / hud …）
game/index.html  エントリ（遊び方オーバーレイを含む）
android/         WebView ラッパー（横画面固定・没入表示・最大リフレッシュレート要求・振動ブリッジ）
tools/           ビルド・確認用スクリプト（shot.js はヘッドレス Chromium でのスクリーンショット、pv_*.py/js は PV、ending_*.py/js はエンディング動画の撮影）
```
