# tools/content

キャラクター（灯真以外の 8 人）の `character.json` / `moves.json` と、全キャラの `data/story/*.json` を作るための作成補助スクリプト。

- 正は `data/` 以下の JSON。スクリプトは初版の作成と一括調整に使う。
- `python3 tools/content/build.py [lena bjorn ...]` で指定キャラ（省略時は 8 人全員）の JSON を上書き生成する。
  JSON を手で調整した後に実行すると、その調整は失われるので注意（スクリプト側にも反映すること）。
- `python3 tools/content/story.py` でストーリーテキストを書き出す。
- 生成後は `tools/bake/bake_all.gd` でベイクし、`tests/run_tests.gd` でフレームデータ・必須カテゴリ・固有システムを検証する。
