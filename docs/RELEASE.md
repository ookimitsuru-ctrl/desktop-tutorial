# リリース手順（署名済み APK）

リリース用の署名鍵はリポジトリに入れません。GitHub の Secrets に登録し、`.github/workflows/release.yml` が使います。

## 1. キーストアを作る（最初の 1 回だけ。PC で実行）

```sh
keytool -genkeypair -v -keystore ringbound-release.keystore -alias ringbound \
  -keyalg RSA -keysize 4096 -validity 10000
```

- パスワードと別名（ここでは `ringbound`）を控えておく。
- **このファイルとパスワードを失うと、同じアプリとして更新を配布できなくなる。** 安全な場所に 2 か所以上保管する。

## 2. Secrets を登録する

GitHub のリポジトリ → Settings → Secrets and variables → Actions → New repository secret:

| 名前 | 値 |
|---|---|
| `RELEASE_KEYSTORE_BASE64` | `base64 -w0 ringbound-release.keystore` の出力（macOS は `base64 -i ringbound-release.keystore`） |
| `RELEASE_KEYSTORE_PASSWORD` | キーストアのパスワード |
| `RELEASE_KEY_ALIAS` | 鍵の別名（例: `ringbound`） |

## 3. リリースする

```sh
git tag v1.0.0
git push origin v1.0.0
```

ワークフローがテストを通したうえで `ringbound-1.0.0.apk` を作り、GitHub Releases に添付します。
Actions のページから手動実行（workflow_dispatch）した場合は、成果物（Artifacts）として取得できます。

## デバッグ版

`main` 以外のブランチも含め、push のたびに CI（`.github/workflows/ci.yml`）がデバッグ署名の APK を作り、Artifacts の `ringbound-debug-apk` に置きます。
