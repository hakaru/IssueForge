# IssueForge v2 設計書 — Reusable GitHub Action

## 概要

IssueForge v2は、再利用可能なGitHub Action（JavaScript Action）として公開するApp Store Connectフィードバック自動Issue化ツール。各ユーザーが自分のリポジトリで `uses: hakaru/IssueForge@v1` と記述し、自分のSecretsでASC認証情報を管理する。

## v1からの変更点

- GitHub App方式 → JavaScript Action方式（各ユーザーのリポジトリで実行）
- ハードコードされたconfig.ts → Action inputs で設定
- Firebase連携は削除（App Store Connect専用）
- 単一リポジトリ内で完結（マルチリポジトリ巡回は不要）

## 対象ソース

| # | ソース | API | デフォルト |
|---|---|---|---|
| 1 | App Store Connect レビュー | `/v1/apps/{id}/customerReviews` | 有効 |
| 2 | App Store Connect クラッシュ | `/v1/apps/{id}/diagnosticSignatures` | 有効 |
| 3 | App Store Connect 審査結果 | `/v1/apps/{id}/appStoreVersions` | 有効 |

## アーキテクチャ

### ユーザー側の利用イメージ

ユーザーは自分のリポジトリに以下のワークフローを追加するだけ：

```yaml
# .github/workflows/issue-forge.yml
name: IssueForge
on:
  schedule:
    - cron: '0 0,12 * * *'
  workflow_dispatch: {}

jobs:
  run:
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - uses: hakaru/IssueForge@v1
        with:
          app-store-app-id: "6757945099"
          asc-issuer-id: ${{ secrets.ASC_ISSUER_ID }}
          asc-key-id: ${{ secrets.ASC_KEY_ID }}
          asc-private-key: ${{ secrets.ASC_PRIVATE_KEY }}
```

### Action inputs

| Input | 必須 | デフォルト | 説明 |
|---|---|---|---|
| `app-store-app-id` | Yes | — | App Store ConnectのApple ID（数字） |
| `asc-issuer-id` | Yes | — | ASC Issuer ID |
| `asc-key-id` | Yes | — | ASC Key ID |
| `asc-private-key` | Yes | — | ASC .p8秘密鍵 |
| `sources` | No | `reviews,crashes,submission` | 有効にするソース（カンマ区切り） |
| `github-token` | No | `${{ github.token }}` | Issue作成用トークン（自動提供） |
| `interval-hours` | No | `12` | 取得対象の時間範囲（直近N時間） |
| `labels-prefix` | No | `issue-forge` | ラベルのプレフィックス |

### Action outputs

| Output | 説明 |
|---|---|
| `issues-created` | 作成されたIssue数 |
| `issues-updated` | 更新されたIssue数 |
| `issues-skipped` | スキップされた数 |

## ディレクトリ構成（IssueForgeリポジトリ）

```
hakaru/IssueForge
├── action.yml                      # JavaScript Action定義
├── dist/
│   └── index.js                    # バンドル済みの実行ファイル（ncc or esbuild）
├── src/
│   ├── index.ts                    # エントリ: inputs解析 → ソース実行 → outputs設定
│   ├── types.ts                    # 共通型定義
│   ├── sources/
│   │   ├── asc-auth.ts             # ASC JWT生成（ソースごとに生成）
│   │   ├── appstore-reviews.ts     # レビュー取得・フォーマット（sanitize済み）
│   │   ├── appstore-crashes.ts     # クラッシュ取得・フォーマット（sanitize済み）
│   │   └── appstore-submission.ts  # 審査結果取得・フォーマット
│   └── github/
│       ├── issue-creator.ts        # Issue作成・コメント追加
│       ├── dedup.ts                # 重複チェック（GitHub Search API）
│       └── labels.ts               # ラベル自動作成（初回のみ）
├── tests/
│   ├── index.test.ts
│   ├── sources/
│   │   ├── asc-auth.test.ts
│   │   ├── appstore-reviews.test.ts
│   │   ├── appstore-crashes.test.ts
│   │   └── appstore-submission.test.ts
│   ├── dedup.test.ts
│   ├── issue-creator.test.ts
│   └── labels.test.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md                       # 公開用ドキュメント
└── LICENSE                         # MIT
```

## action.yml

```yaml
name: 'IssueForge'
description: 'Automatically create GitHub Issues from App Store Connect feedback'
author: 'hakaru'

inputs:
  app-store-app-id:
    description: 'App Store Connect Apple ID (numeric)'
    required: true
  asc-issuer-id:
    description: 'App Store Connect API Issuer ID'
    required: true
  asc-key-id:
    description: 'App Store Connect API Key ID'
    required: true
  asc-private-key:
    description: 'App Store Connect API Private Key (.p8 content)'
    required: true
  sources:
    description: 'Comma-separated list of sources to enable'
    required: false
    default: 'reviews,crashes,submission'
  github-token:
    description: 'GitHub token for creating issues'
    required: false
    default: ${{ github.token }}
  interval-hours:
    description: 'Time window in hours to fetch data for'
    required: false
    default: '12'
  labels-prefix:
    description: 'Prefix for auto-created labels'
    required: false
    default: 'issue-forge'

outputs:
  issues-created:
    description: 'Number of issues created'
  issues-updated:
    description: 'Number of issues updated'
  issues-skipped:
    description: 'Number of issues skipped'

runs:
  using: 'node20'
  main: 'dist/index.js'
```

## 実行フロー

```
Action実行
  ↓
inputs解析 + バリデーション
  - app-store-app-id: 数字のみ許可
  - sources: パース + ホワイトリスト検証
  ↓
ラベル確認・作成（初回のみ、存在チェック → なければ作成）
  ↓
有効なソースを順次実行:
  1. ASC JWT生成（ソースごとに新規生成、20分有効）
  2. ASC API呼び出し（interval-hoursに基づく時間フィルタ: ワークフロー実行時刻からN時間前まで）
     - レビュー: `sort=-createdDate&limit=50` で取得後、createdDateで時間フィルタ
     - クラッシュ: シグネチャ一覧を取得（時間フィルタなし、dedupで差分管理）
     - 審査: 最新5バージョンを取得（dedupで差分管理）
  3. IssueCandidate生成
  4. 重複チェック（GitHub Search API、openなIssueのみ）
  5. Issue作成 or コメント追加 or スキップ
  ↓
結果ログ + outputs設定
```

## 重複チェック

v1と同じ仕組み。

- **merge戦略**: App Storeクラッシュ — 同じキーのIssueが存在すればコメント追加 → `issues-updated` にカウント
- **create-once戦略**: レビュー, 審査結果 — 同じキーのIssueが存在すればスキップ → `issues-skipped` にカウント
- 検索対象: **openなIssueのみ**（closedは無視 → ユーザーがcloseで「対応済み」を表現できる）
- dedupキー: Issue本文のHTMLコメント `<!-- issue-forge:{sourceType}:{key} -->`
- 検索クエリ: `repo:{owner}/{repo} is:issue is:open label:"{prefix}:{sourceType}" "{marker}" in:body`
- GitHub Search APIの制限（30req/min、結果1000件上限）への対策: dedupキーをマーカーとして検索するため、1リクエストで0-1件にマッチする設計。大量Issueでも問題なし。ソースあたり最大50件のfetchなので、最大50回の検索 = 約2分/ソース（レート制限内）

### 新規クラッシュ/審査結果の判定

- **クラッシュ**: `diagnosticSignatures` APIはシグネチャ一覧を返す。各シグネチャIDをdedupキーとして使用。既にIssueがあればコメント追加（weight更新）、なければ新規作成。
- **審査結果**: `appStoreVersions` APIで最新5バージョンを取得。`{versionString}-{appStoreState}` をdedupキーとして使用。REJECTED, READY_FOR_DISTRIBUTION等の関連ステータスのみ対象。既にIssueがあればスキップ。

## ラベル自動作成

`github/labels.ts` で管理。

```ts
const LABELS = [
  { name: "{prefix}", color: "0366d6", description: "Auto-created by IssueForge" },
  { name: "{prefix}:review", color: "fbca04", description: "App Store review" },
  { name: "{prefix}:appstore-crash", color: "d93f0b", description: "App Store crash" },
  { name: "{prefix}:submission", color: "5319e7", description: "App Store submission" },
  // star:1〜star:5, priority:*, status:* は必要時に作成
];
```

- 実行時にラベル存在チェック → なければ作成
- 既存ラベルは上書きしない（ユーザーが色を変えている可能性）
- ラベル作成失敗は警告ログ出力して続行（Issues:Write権限でラベル作成可能）

## ビルド・配布

### バンドル

`@vercel/ncc` で `src/index.ts` を `dist/index.js` に単一ファイルバンドル。

```json
{
  "scripts": {
    "build": "ncc build src/index.ts -o dist --minify",
    "start": "tsx src/index.ts",
    "test": "vitest run"
  }
}
```

### リリースワークフロー

`.github/workflows/release.yml` で自動化：

```yaml
name: Release
on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - name: Verify dist is up to date
        run: |
          git diff --exit-code dist/ || (echo "dist/ is out of date. Run npm run build and commit." && exit 1)
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
```

### リリース手順

1. コード変更 → テスト → `npm run build` → `dist/` をコミット
2. `git tag v1.0.0 && git push --tags`
3. リリースワークフローが自動実行（dist/が最新か検証 + Release作成）
4. major tag `v1` を手動更新: `git tag -f v1 v1.0.0 && git push -f origin v1`

### バージョニング

- semver: `v1.0.0`, `v1.0.1`, ...
- major tag: `v1` を最新パッチに追従させる（`uses: hakaru/IssueForge@v1` で常に最新）

## セキュリティ

- ASCキーは各ユーザーのRepository Secretsに格納（IssueForge側は一切保持しない）
- `github-token` はデフォルトで `${{ github.token }}`（自動提供、最小権限）
- ユーザー入力（レビューテキスト等）はsanitize済み（HTMLコメント注入、Markdownテーブル破壊を防止）
- `app-store-app-id` は数字のみバリデーション
- ASC JWT はソースごとに生成（期限切れ防止）
- Action自体はSHA pinningを推奨（README記載）
- inputs経由の秘密鍵は `core.setSecret()` でログマスクを明示設定

## inputs バリデーション

```
app-store-app-id: /^\d+$/ でなければエラー終了
asc-issuer-id: 空文字でなければOK
asc-key-id: 空文字でなければOK
asc-private-key: "-----BEGIN PRIVATE KEY-----" または "-----BEGIN EC PRIVATE KEY-----" を含むかチェック
sources: "reviews", "crashes", "submission" のいずれか（不明値は警告して無視）
interval-hours: 正の整数（デフォルト12）
labels-prefix: /^[a-zA-Z0-9_:-]+$/ でなければデフォルト値にフォールバック
```

## エラーハンドリング

- 各ソースはtry-catchで独立実行。1つ失敗しても他は続行
- 失敗ソースは `core.warning()` で警告
- 全ソース失敗した場合のみ `core.setFailed()` でActionをfailにする
- .issueforge.yml 不備のスキップは「失敗」にカウントしない
- ASC APIレート制限: ソースあたり最小限のリクエスト

### ログ出力

```
IssueForge: 3 sources enabled (reviews, crashes, submission)
[reviews] 3 new reviews → 2 created, 1 skipped
[crashes] No new crash signatures
[submission] v2.1.0 REJECTED → 1 created
Done. created=3 updated=0 skipped=1
```

`$GITHUB_STEP_SUMMARY` にもMarkdownサマリーを出力：

```markdown
## IssueForge Results

| Source | Created | Updated | Skipped |
|--------|---------|---------|---------|
| Reviews | 2 | 0 | 1 |
| Crashes | 0 | 0 | 0 |
| Submission | 1 | 0 | 0 |
| **Total** | **3** | **0** | **1** |
```

## 自分のリポジトリ（hakaru）での利用

hakaru自身は以下のように利用する：

**hakaru/1Take/.github/workflows/issue-forge.yml:**
```yaml
name: IssueForge
on:
  schedule:
    - cron: '0 0,12 * * *'
  workflow_dispatch: {}

jobs:
  run:
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - uses: hakaru/IssueForge@v1
        with:
          app-store-app-id: "6757945099"
          asc-issuer-id: ${{ secrets.ASC_ISSUER_ID }}
          asc-key-id: ${{ secrets.ASC_KEY_ID }}
          asc-private-key: ${{ secrets.ASC_PRIVATE_KEY }}
```

**hakaru/GitInflow/.github/workflows/issue-forge.yml:**
```yaml
name: IssueForge
on:
  schedule:
    - cron: '0 0,12 * * *'
  workflow_dispatch: {}

jobs:
  run:
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - uses: hakaru/IssueForge@v1
        with:
          app-store-app-id: "<GitInflowのAppID>"
          asc-issuer-id: ${{ secrets.ASC_ISSUER_ID }}
          asc-key-id: ${{ secrets.ASC_KEY_ID }}
          asc-private-key: ${{ secrets.ASC_PRIVATE_KEY }}
```

ASC Secretsは同じアカウントなのでOrganization Secretsで共有可能（個人アカウントの場合はリポジトリごとに設定）。

## 1Takeからの移行

1. IssueForgeリポジトリでAction開発・ビルド・タグ付け
2. 1Takeの `issue-forge/` ディレクトリを削除
3. 1Takeの `.github/workflows/issue-forge.yml` を上記の形に書き換え
4. 1TakeのFirebase連携（Crashlytics/Analytics）は削除。将来的にFirebase対応が必要な場合は別Action `hakaru/IssueForge-firebase` として開発する

## 公開準備

- README.md: 使い方、ASCキー取得手順、inputs/outputs説明
- action.yml: Marketplace検索用メタデータ
- LICENSE: MIT
- CHANGELOG.md: バージョン履歴

## 将来の拡張

- Firebase連携プラグイン（別Action `hakaru/IssueForge-firebase@v1` として）
- Google Play Console対応（別Action）
- カスタムIssueテンプレート（inputでテンプレートファイルパスを指定）
- Slack/Discord通知（Action outputsを後続ステップで使用）
