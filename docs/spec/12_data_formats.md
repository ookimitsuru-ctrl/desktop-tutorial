# 12 データフォーマット

## 12.1 共通規約

- 文字コード UTF-8、インデント 2スペース、キーは `snake_case`。
- 全ファイルの先頭に `"schema_version": <int>` を持つ。
- ID は英小文字・数字・アンダースコア（例: `toma`、`toma_6p`）。技 ID は `<キャラID>_<コマンドを英数字化>`（`6P+K` → `toma_6pk`、`P,P,K` → `toma_ppk`、`立ちP` → `toma_wsp`、`回避中P` → `toma_evp`、`背向けK` → `toma_btk`）。重複時は `_2` を付ける。
- **シミュレーションに影響する小数は文字列で書く**（例: `"0.70"`）。読み込み時に浮動小数点を経由せず Q16.16 に変換する（[11 §11.6.2](11_technical_architecture.md)）。整数はそのまま数値で書く。
- 単位: 長さ m、時間 F（フレーム）、角度 度、速度 m/F（明記がない場合）。
- 各スキーマは `tools/validate/schemas/*.json`（JSON Schema 2020-12 相当の独自サブセット）として実装し、`tools/validate/validate_all.gd` が全データを検証する。

## 12.2 `data/common/rules.json`（全体ルール）

```json
{
  "schema_version": 1,
  "health": 1000,
  "round_seconds_default": 45,
  "rounds_to_win_default": 2,
  "start_distance": "2.40",
  "input": {
    "history_frames": 60,
    "simultaneous_window": 2,
    "double_tap_window": 12,
    "motion_window_2dir": 10,
    "motion_window_3dir": 16,
    "button_after_motion": 6,
    "buffer_frames": 8,
    "crouch_tap_to_evade_frames": 5
  },
  "evade": { "total": 22, "start_end": 3, "success_start": 4, "success_end": 14, "distance": "0.70",
             "guard_cancel_from": 8, "attack_window": [8, 14], "success_bonus_frames": 6 },
  "throw": { "startup": 10, "whiff_recovery": 20, "escape_before": 8, "escape_after": 7,
             "escape_max_dirs": 2, "post_stun_protect": 2, "escape_advantage": 2 },
  "counter": { "damage_mul": "1.25", "default_extra_adv": 3 },
  "hitstop": { "light": [6, 5], "medium": [8, 6], "heavy": [11, 8], "launch": [10, 7],
               "finisher": 20, "ch_bonus": 3, "air_mul": "0.6667" },
  "juggle": { "gravity": "0.0065", "relaunch_decay": "0.86", "gravity_add_per_hit": "0.05",
              "max_air_hits": 8, "scaling": ["1.00", "0.85", "0.70", "0.60", "0.50"],
              "wall_mul": "0.80", "stagger_first_mul": "0.90" },
  "stagger": { "max_reduction_ratio": "0.50", "reduction_per_input": 1 },
  "tech": { "window_before": 4, "window_after": 5, "invuln_frames": 10 },
  "down": { "min_lying": 20, "max_lying": 120 },
  "wall": { "hit_min_speed": "0.02", "stagger_frames": 30, "splat_frames": 40, "max_per_combo": 1,
            "breakable_hp": 2 },
  "relative_angle": { "side_from": 60, "back_from": 120, "side_hitstun_bonus": 2, "back_damage_mul": "1.10" },
  "tracking_default_rate_deg": 6
}
```

## 12.3 `data/characters/<id>/character.json`

```json
{
  "schema_version": 1,
  "id": "toma",
  "name": { "ja": "篠宮 灯真", "en": "Toma Shinomiya" },
  "style": { "ja": "篠宮流 実戦空手", "en": "Shinomiya-ryu Combat Karate" },
  "difficulty": 2,
  "weight_class": "middle",
  "height_m": "1.78",
  "physics": {
    "push_radius": "0.30",
    "float_factor": "1.00",
    "hurtbox_radius_mul": "1.00",
    "throw_range": "0.90"
  },
  "movement": {
    "walk_forward": "0.02583",
    "walk_back": "0.02083",
    "dash_forward": { "frames": 18, "distance": "1.40" },
    "dash_back": { "frames": 20, "distance": "1.10" },
    "run_max": "0.07500",
    "evade_total": 22
  },
  "costumes": [
    { "id": "a", "model": "res://assets/characters/toma/toma_a.glb", "colors": 4 },
    { "id": "b", "model": "res://assets/characters/toma/toma_b.glb", "colors": 4 }
  ],
  "colors": [
    { "primary": "#F2EEE4", "secondary": "#1F2A4D", "accent": "#C8372D" },
    { "primary": "#1A1A1A", "secondary": "#B3262B", "accent": "#E0E0E0" },
    { "primary": "#EDE6D3", "secondary": "#25503B", "accent": "#C9A548" },
    { "primary": "#8C8C8C", "secondary": "#C9A548", "accent": "#1A1A1A" }
  ],
  "home_stage": "temple",
  "rival": "zaw",
  "voice_set": "res://assets/audio/voice/toma/",
  "overrides": {}
}
```

- `walk_forward` は m/F（1.55 m/s ÷ 60 = 0.02583）。

## 12.4 `data/characters/<id>/moves.json`

### 12.4.1 打撃技の例

```json
{
  "schema_version": 1,
  "character": "toma",
  "moves": [
    {
      "id": "toma_3k",
      "name": { "ja": "中段回し蹴り", "en": "Middle Roundhouse" },
      "command": "3K",
      "from": ["stand", "walk", "crouch_in"],
      "tags": ["mid_kick", "ch_stagger", "half_right"],
      "category": "basic",
      "level": "mid",
      "limb": "kick",
      "damage": 110,
      "startup": 16,
      "active": 3,
      "recovery": 21,
      "on_block": -6,
      "on_hit": 5,
      "on_ch": "STAGGER",
      "weight": "medium",
      "hit_reaction": "mid_heavy",
      "ch_reaction": "stagger_gut",
      "stagger_frames": 40,
      "tracking": { "type": "half_right", "until_frame": 12, "rate_deg": 6 },
      "hitboxes": [
        { "bone": "RightFoot", "offset": ["0", "0.02", "0.06"], "radius": "0.09", "frames": [16, 18], "group": 0 }
      ],
      "posture": [],
      "push": { "block": "0.25", "hit": "0.30" },
      "chain": [],
      "flags": [],
      "anim": "toma_3k",
      "fx": { "trail": "right_leg" }
    }
  ]
}
```

### 12.4.2 フィールド定義

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | string | ✔ | 技 ID |
| `name` | {ja,en} | ✔ | 技名 |
| `command` | string | ✔ | §12.11 の文法。連携の次段は `chain` 側から参照されるため、`command` は単独入力の形（`P`）で書き、`chain_only: true` を付ける |
| `chain_only` | bool | | 連携の次段としてのみ出る技 |
| `from` | string[] | ✔ | 出せる状態: `stand` `walk` `crouch` `crouch_in` `stand_up` `dash` `run` `evade` `backturn` `stance:<名>` `down` |
| `tags` | string[] | | AI・トライアル・必須カテゴリ検証で使う分類 |
| `category` | enum | ✔ | 技表の分類: `basic` `string` `special` `system` `throw` `evade` `backturn` `down_attack` `run` `wall` |
| `level` | enum | ✔ | `high` `mid` `low` `smid` `throw` `lthrow` `down` `parry` `stance` `none` |
| `limb` | enum | 打撃は✔ | `punch` `elbow` `kick` `knee` `head` `body`（受け流し系が判定に使う） |
| `damage` | int | ✔ | 基本ダメージ |
| `startup` / `active` / `recovery` | int | ✔ | [02 §2.12](02_combat_system.md) |
| `on_block` / `on_hit` / `on_ch` | int または enum | ✔（on_ch は任意） | enum: `KD` `LAUNCH` `STAGGER` `CRUMPLE` `KNOCKBACK` `WALLSPLAT` `TURN`。enum の場合の実際の有利は各リアクションの定義から決まる |
| `weight` | enum | ✔ | `light` `medium` `heavy` `launch`（ヒットストップ・SE・カメラ揺れ） |
| `hit_reaction` / `ch_reaction` | string | ✔ / 任意 | [02 §2.7.4](02_combat_system.md) の ID |
| `stagger_frames` | int | よろけ時 | |
| `launch` | {vy, vx} | 浮かせ時 | 文字列小数（m/F） |
| `air_launch_vy` | string | | 空中ヒット時の再浮き速度 |
| `tracking` | object | ✔ | `type`: `linear` `half_left` `half_right` `full`、`until_frame`、`rate_deg` |
| `hitboxes` | object[] | 打撃は✔ | `bone`、`offset`[x,y,z]、`radius`、`frames`[開始,終了]、`group`（多段技の各段） |
| `posture` | object[] | | `{frames:[a,b], flag}`。flag: `low_profile`（上段無効）`airborne`（下段無効）`strike_invuln` `throw_invuln` `full_invuln` |
| `push` | {block, hit} | | 押し戻し（m） |
| `chain` | object[] | | `{to: 技ID, input: "P", window: [a, b], on: "any"|"hit"|"block_or_hit", delay_max: int}` |
| `just_frame` | object | | `{input: "P", frame: 14, to: 技ID}`（前段の発生から数えて `frame` ちょうど） |
| `charge` | object | | `{button: "P", frames: 40, to: 技ID, cancel_from: 12}` |
| `stance_after` | string | | 技終了後に移行する構え |
| `ends_backturned` | bool | | 技終了後に背向け |
| `flags` | string[] | | `guard_crush` `wall_splat` `wall_break` `no_tech` `hits_down` `can_ringout` `cinematic` `wall_only` `attacker_wall_only` |
| `parry` | object | 当て身系 | `{window: [3, 12], catches: {"levels": ["high","mid"], "limbs": ["punch","elbow"]}, success: 技ID, whiff_recovery: 20}` |
| `throw` | object | 投げ | §12.4.3 |
| `priority` | int | | 省略時は [02 §2.3.7](02_combat_system.md) の既定式 |
| `anim` | string | ✔ | アニメーション ID（`anims/<id>.pose.json`） |
| `fx` | object | | `trail`（`right_arm` 等）、`sfx_override`、`vfx_override` |
| `ai` | object | | `{use_weight: "1.0", notes: "..."}`（プレイブックの補助） |

**検証ルール（`validate_all.gd`）**:
- `startup ≥ 1`、`active ≥ 1`、`recovery ≥ 0`、`hitboxes[].frames` が `[startup, startup+active-1]` の範囲内
- アニメーションの全長 = `startup + active - 1 + recovery`、`contact_frame` = `startup`
- 有利フレームから算出した防御側硬直が 1 以上
- `chain.to` / `just_frame.to` / `charge.to` / `parry.success` の参照先が存在
- コマンドの重複（同一 `from` で同一 `command`）がない
- キャラの必須カテゴリ（[04 §4.3](04_characters.md)）を満たす

### 12.4.3 投げ

```json
{
  "id": "toma_6pg",
  "name": { "ja": "背負い落とし", "en": "Shoulder Drop" },
  "command": "6P+G",
  "from": ["stand", "walk"],
  "category": "throw",
  "level": "throw",
  "damage": 280,
  "startup": 10,
  "throw": {
    "range": "0.90",
    "angle": "front",
    "escape": "6",
    "anim_pair": "toma_6pg",
    "duration": 72,
    "damage_frame": 48,
    "result": {
      "attacker_state": "stand",
      "attacker_recovery_after": 0,
      "defender_state": "down_face_up_head_near",
      "swap_sides": true,
      "defender_offset": ["0", "0", "1.10"],
      "advantage_note": "8P は横転で回避可能"
    },
    "can_ringout": true,
    "no_tech": false,
    "next": []
  },
  "anim": "toma_6pg"
}
```

- `angle`: `front` / `side` / `back` / `wall`（壁際専用）/ `down`（ダウン投げ）/ `crumple`（崩れ中）
- `next`（多段投げ）: `[{input: "P+G", window: 18, escape: "N", to: "bjorn_46pg_2a"}]`
- 被投げ側の相対変換トラックはベイク済み `throw.bin` に入る（`anim_pair` の ID で引く）。

## 12.5 ポーズDSL `data/characters/<id>/anims/<anim_id>.pose.json`

```json
{
  "schema_version": 1,
  "id": "toma_3k",
  "length": 39,
  "loop": false,
  "base_pose": "toma.stance",
  "contact_frame": 16,
  "keys": [
    { "f": 0,  "pose": "toma.stance" },
    { "f": 6,  "ease": "out_quad",
      "bones": { "Hips": [0, -15, 0], "Spine": [5, -10, 0], "LeftUpperLeg": [-10, 0, 0],
                 "RightUpperLeg": [-35, 0, -20], "RightLowerLeg": [80, 0, 0] },
      "root": [0, 0, "0.02"] },
    { "f": 13, "ease": "in_cubic",
      "bones": { "Hips": [0, -40, 0], "RightUpperLeg": [-60, 10, -70], "RightLowerLeg": [95, 0, 0] } },
    { "f": 16, "ease": "linear",
      "bones": { "Hips": [0, -55, 0], "Spine": [-5, -20, 10], "RightUpperLeg": [-75, 15, -85],
                 "RightLowerLeg": [5, 0, 0], "RightFoot": [30, 0, 0] },
      "root": [0, 0, "0.10"] },
    { "f": 18, "ease": "out_quad", "copy": 16, "bones": { "RightLowerLeg": [0, 0, 0] } },
    { "f": 28, "ease": "in_out_cubic",
      "bones": { "Hips": [0, -25, 0], "RightUpperLeg": [-30, 0, -30], "RightLowerLeg": [70, 0, 0] } },
    { "f": 39, "ease": "out_cubic", "pose": "toma.stance", "root": [0, 0, "0.12"] }
  ],
  "events": [ { "f": 15, "type": "sfx", "id": "swish_kick_m" }, { "f": 30, "type": "footstep", "foot": "right" } ]
}
```

| フィールド | 説明 |
|---|---|
| `length` | 全フレーム数（技の全体フレームと一致必須） |
| `base_pose` | 省略されたボーンの値を取るポーズ（`poses.json` の名前） |
| `keys[].f` | フレーム番号。**技のフレーム番号と同じ数え方**（`f: 16` = 技の 16F目＝発生16Fの技なら当たる瞬間の姿勢）。`f: 0` は技の開始直前の姿勢（前の状態からのつなぎ）を表す |
| `keys[].pose` | 名前付きポーズを丸ごと使う |
| `keys[].copy` | 指定フレームのキーを複製してから `bones` を上書き |
| `keys[].bones` | ボーン名 → 基準姿勢からのオイラー角（度、XYZ 順）。数値は角度なので float 可（描画用データでありシミュレーションには入らない。ルート移動はベイク時に固定小数点化される） |
| `keys[].root` | ルート位置（m、ローカル: x=右, y=上, z=前）。省略時は前キーの値 |
| `keys[].ease` | 前キーからこのキーへの補間: `linear` `in_quad` `out_quad` `in_out_quad` `in_cubic` `out_cubic` `in_out_cubic` `step` `bezier(x1,y1,x2,y2)` |
| `events` | `sfx` / `footstep` / `vfx` / `face`（表情） |
| `mirror_of` | 左右反転元のアニメーション ID（このとき `keys` は不要） |

`data/characters/<id>/poses.json` は `{ "toma.stance": { "Hips": [...], ... }, ... }` の辞書。共通ポーズは `data/common/poses.json`（`common.*`）。

## 12.6 `data/stages/<id>.json`

```json
{
  "schema_version": 1,
  "id": "bamboo",
  "name": { "ja": "竹林の石舞台", "en": "Bamboo Stage" },
  "scene": "res://assets/stages/bamboo/bamboo.tscn",
  "ring": {
    "shape": "polygon",
    "vertices": [["-5.5", "-5.5"], ["5.5", "-5.5"], ["5.5", "5.5"], ["-5.5", "5.5"]],
    "edges": [
      { "type": "fence", "height": "0.70" },
      { "type": "open" },
      { "type": "fence", "height": "0.70" },
      { "type": "open" }
    ],
    "start_positions": [["-1.20", "0"], ["1.20", "0"]],
    "ringout_floor_y": "-2.0"
  },
  "camera": { "intro_path": "res://assets/stages/bamboo/intro_path.tres" },
  "lighting": { "rim_color": "#CFE6D8", "rim_intensity": "0.6", "rim_dir": ["-0.4", "0.5", "0.7"], "wetness": "0.0" },
  "audio": { "bgm": "bgm_bamboo", "ambience": ["amb_bamboo_wind", "amb_birds"], "ringout_sfx": "ringout_grass" },
  "ground_material": "stone",
  "unlock": "initial"
}
```

- 辺 `i` は頂点 `i` → 頂点 `i+1` を結ぶ。頂点は反時計回り（上から見て）。
- `breakable` 辺: `{ "type": "breakable", "hp": 2, "after": "open", "mesh_intact": "...", "mesh_broken": "..." }`。
- 円形リングは 32 角形の頂点列で表す（ツールで生成）。

## 12.7 `data/characters/<id>/ai_playbook.json`

```json
{
  "schema_version": 1,
  "character": "toma",
  "personality": { "aggression": "0.55", "caution": "0.50", "throw_love": "0.40", "evade_love": "0.35" },
  "neutral": {
    "far":   { "approach": "0.5", "dash_in": "0.3", "wait": "0.2", "pokes": ["toma_66k"] },
    "mid":   { "poke": "0.4", "whiff_punish_wait": "0.3", "evade": "0.1", "pokes": ["toma_6k", "toma_3k"] },
    "close": { "jab": "0.3", "mid": "0.3", "low": "0.15", "throw": "0.15", "guard": "0.1" }
  },
  "advantage_mixups": {
    "mid": ["toma_6p", "toma_3k", "toma_kg"],
    "low": ["toma_2k", "toma_1k"],
    "throw": ["toma_6pg", "toma_46pg", "toma_pg"],
    "frame_trap": ["toma_3p"]
  },
  "okizeme": { "mid": ["toma_kg"], "low": ["toma_1k"], "down_attack": ["toma_8p", "toma_2p_down"] },
  "edge_priority": ["toma_pk", "toma_6pg", "toma_66p"],
  "system_usage": { "toma_4pk_parry_rate": "0.10" }
}
```

## 12.8 `combos.json` / `trials.json`

```json
{
  "schema_version": 1,
  "character": "toma",
  "combos": [
    { "id": "toma_c_wsp_basic", "starter": "toma_wsp", "context": "launch",
      "route": ["toma_wsp", "toma_6p", "toma_p", "toma_pp", "toma_ppk"],
      "timing": [0, 22, 18, 9, 11],
      "weight_classes": ["light", "middle", "heavy"],
      "expected_damage": 289, "wall": false, "difficulty": 2 }
  ]
}
```

- `timing`: 前の技の入力から次の入力までのフレーム数（AI の入力生成とトライアルのお手本に使う）。
- `weight_classes`: そのコンボが成立する相手の体重級（自動検証で各体重級のダミーに対して実行し、成立を確認する）。

```json
{
  "schema_version": 1,
  "character": "toma",
  "trials": [
    { "no": 1, "title": { "ja": "刻み突き", "en": "Jab" }, "steps": [{ "move": "toma_p", "result": "hit" }],
      "dummy": { "action": "stand" } },
    { "no": 10, "title": { "ja": "確定反撃: 立ちP", "en": "Punish: Rising Punch" },
      "setup": { "dummy_move": "zaw_6pk", "player_guard": "stand" },
      "steps": [{ "move": "toma_wsp", "result": "launch" }] },
    { "no": 15, "title": { "ja": "基本コンボ", "en": "Basic Combo" }, "combo": "toma_c_wsp_basic" }
  ]
}
```

## 12.9 リプレイファイル（`.rbr`、バイナリ・リトルエンディアン）

| オフセット | 型 | 内容 |
|---|---|---|
| 0 | char[4] | マジック `RBRP` |
| 4 | u16 | フォーマットバージョン |
| 6 | char[16] | ゲームバージョン文字列 |
| 22 | u8[32] | データハッシュ（SHA-256） |
| 54 | u32 | 乱数シード |
| 58 | u16 | ヘッダ JSON の長さ N |
| 60 | u8[N] | ヘッダ JSON（キャラ・カラー・衣装・ステージ・ルール・CPU レベル・日時・プレイヤー名） |
| … | ブロック列 | `[u32 開始フレーム][u16 フレーム数][各フレーム: P1 u16, P2 u16]` を RLE（同一入力の連続を `[u16 0xFFFF][u16 回数]` で圧縮） |
| … | チェックサム列 | 60F ごとの `[u32 frame][u32 checksum]` |

- 入力 u16 のビット割り当て: bit0-3 方向（1〜9、0=未使用）、bit4-6 held（P,K,G）、bit7-9 pressed、bit10-12 released、bit13-15 予約。

## 12.10 セーブデータ

- `user://save/profile.json`: `schema_version`、段位ポイント、解禁フラグ一覧、実績、キャラ別戦績、記録（スコア・タイム・サバイバル）。
- `user://save/settings.json`: [08 §8.7](08_ui_ux.md) の全項目、ゲームパッド割当、タッチレイアウト3スロット。
- 書き込み: `*.tmp` に書き込み → 旧ファイルを `*.bak` へ → `*.tmp` を本名へリネーム。読み込み失敗時は `*.bak` から復旧。

## 12.11 入力コマンドの文法（EBNF）

```
command     = [ prefix ] , body ;
prefix      = "立ち" | "回避中" | "背向け" | "ダウン中" | "走り" | stance_name , "中" ;   (* データ上は from で表すため、command 文字列では省略可 *)
body        = motion , buttons | buttons | motion ;
motion      = { direction } , [ "_" , direction ] ;      (* 例: 46, 41236, 66, 3_6 *)
direction   = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" ;
buttons     = button_set , [ "[J]" ] ;
button_set  = ( button | "(" , button , ")" ) , { "+" , button } ;
button      = "P" | "K" | "G" ;
```

- `46P`: 4 → 6 → P（[02 §2.3.3](02_combat_system.md) の猶予）
- `66K`: 6 タップ → N → 6 → K
- `3_6`: 3 から 6 へ移行（月嵐の進歩）
- `46(P)`: 46 の後 P を押しっぱなし（溜め）
- `P+G`: 同時押し
- コマンドパーサーは起動時に全技のコマンド文字列をこの文法で解析し、`CommandSpec`（方向イベント列・ボタン条件・猶予）へ変換する。解析できない文字列はデータ検証エラー。

## 12.12 イベント・ID 一覧の管理

- 被弾リアクション ID（`data/common/hit_reactions.json`）、SE/VFX の ID（`assets/audio/sfx_index.json`、`assets/vfx/vfx_index.json`）、BGM ID は全て一覧ファイルで管理し、データ検証で参照切れを検出する。
