# アセット台帳

`assets/` 以下の全ファイルを記録する（仕様 [18 §18.3](spec/18_legal_and_assets.md)）。
パスにはワイルドカード（`*`）を使ってよい。`tools/validate/check_ledger.py` が CI で記載漏れを検査する（`.import` は Godot の生成物なので対象外）。

| パス | 種類 | 出典 | ライセンス | 取得日 | 改変 | クレジット要否 |
|---|---|---|---|---|---|---|
| `assets/characters/*/*.glb` | model | 自作（`tools/charmodel/gen_mech.py`: 機甲兵の硬い部品（凸包）を骨格に剛体で取り付けて glTF に。旧来の人間のモデルは `gen_model.py`） | 自作 | 2026-11-05 | — | 不要 |
| `assets/audio/sfx/*.wav` | sfx | 自作（`tools/audio/gen_sfx.py`: numpy による波形合成） | 自作 | 2026-11-04 | — | 不要 |
| `assets/audio/bgm/*.ogg` | bgm | 自作（`tools/audio/gen_bgm.py`: mido で作曲した MIDI を FluidSynth + FluidR3_GM で再生・録音。ステージの曲の太鼓・打楽器は `tools/audio/drumkit.py` で波形から合成） | 自作（音源 FluidR3_GM は MIT） | 2026-11-04 | ループ点の付与、OGG Vorbis 化 | 不要（音源のライセンス表記はクレジットに記載） |
| `assets/audio/announcer/*.wav` | voice | 自作（`tools/audio/gen_voice.py`: espeak-ng の合成音声を加工） | 自作（espeak-ng は GPL-3.0 だが、出力音声はプログラムの著作物ではない） | 2026-11-04 | ピッチ低下、帯域制限、歪み、残響 | 不要 |
| `assets/audio/voice/*/*.wav` | voice | 自作（`tools/audio/gen_voice.py`: 声帯音源 + フォルマントの合成） | 自作 | 2026-11-04 | — | 不要 |
| `assets/fonts/NotoSansJP-*.ttf` | font | Google Fonts（Noto Sans JP） | OFL 1.1 | 2026-11-04 | 使用文字でのサブセット化（`tools/gen/subset_fonts.py`） | 要 |
| `assets/fonts/DelaGothicOne-Regular.ttf` | font | Google Fonts（Dela Gothic One） | OFL 1.1 | 2026-11-04 | 使用文字でのサブセット化 | 要 |
| `assets/fonts/Oswald-Bold.ttf` | font | Google Fonts（Oswald） | OFL 1.1 | 2026-11-04 | — | 要 |
| `assets/fonts/OFL.txt` | other | 上記フォントのライセンス文 | OFL 1.1 | 2026-11-04 | 著作権表示を追記 | — |
| `assets/ui/icon*.png` | texture | 自作（`assets/ui/icon.svg` から書き出し） | 自作 | 2026-11-04 | — | 不要 |
| `assets/ui/icon.svg` | texture | 自作 | 自作 | 2026-11-04 | — | 不要 |
| `assets/ui/theme.tres` | other | 自作（Godot の Theme リソース） | 自作 | 2026-11-04 | — | 不要 |
| `assets/audio/ambience/*.ogg` | sfx | 自作（`tools/audio/gen_ambience.py`: 雑音の帯域整形・揺らぎ・粒の合成でループを作成） | 自作 | 2026-11-04 | ループ化（末尾を先頭へクロスフェード） | 不要 |
| `assets/textures/*.png` | texture | 自作（`tools/gen/gen_textures.py`: 乱数から周波数領域で生成した継ぎ目なしの質感・凹凸） | 自作 | 2026-11-10 | — | 不要 |
| `assets/vfx/words/*.png` | texture | 自作（`tools/gen/gen_onomatopoeia.py`: Dela Gothic One の文字を加工して描いたアメコミ風の擬音） | 自作（書体は OFL） | 2026-11-11 | — | 不要 |
