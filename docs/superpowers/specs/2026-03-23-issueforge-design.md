# IssueForge v1 設計書

## 概要

IssueForgeは、複数のフィードバックソースから情報を自動収集し、対応するGitHubリポジトリにIssueとして追加するツール。GitHub Actionsで定期実行する。

## 対象

- **アプリ**: 1Take (`hakaru/1Take`)
- **将来**: 他アプリへの拡張を想定（設定ファイルベースで切り替え可能に）

## ソース

| # | ソース | 取得内容 | API |
|---|---|---|---|
| 1 | Firebase Crashlytics | 新規/未解決クラッシュ | BigQuery Export (crashlytics_export) |
| 2 | Firebase Analytics | 異常値検出（DAU急落、エラー率急増等） | Google Analytics Data API (GA4) |
| 3 | App Store Connect レビュー | ユーザーレビュー（星評価+コメント） | App Store Connect API v1 |
| 4 | App Store Connect クラッシュ | クラッシュシグネチャ | App Store Connect API v1 |
| 5 | App Store Connect 審査 | 審査ステータス変更（特にリジェクト） | App Store Connect API v1 |

## アーキテクチャ

### 実行環境

- **GitHub Actions** (cron schedule + workflow_dispatch)
- **スケジュール**: 1日2回 (JST 9:00 / 21:00 = UTC 0:00 / 12:00)
- **手動実行**: ソースを指定して個別実行可能
- **言語**: TypeScript (Node.js 20)

### ディレクトリ構成

```
1Take リポジトリ
├── .github/
│   └── workflows/
│       └── issue-forge.yml
├── issue-forge/
│   ├── src/
│   │   ├── index.ts               # エントリポイント
│   │   ├── sources/
│   │   │   ├── crashlytics.ts     # Firebase Crashlytics
│   │   │   ├── analytics.ts       # Firebase Analytics 異常検出
│   │   │   ├── appstore-reviews.ts    # レビュー取得
│   │   │   ├── appstore-crashes.ts    # クラッシュログ取得
│   │   │   └── appstore-submission.ts # 審査結果取得
│   │   ├── github/
│   │   │   ├── issue-creator.ts   # Issue作成
│   │   │   └── dedup.ts           # 重複チェック
│   │   ├── config.ts              # 設定・閾値
│   │   └── types.ts               # 共通型定義
│   ├── package.json
│   └── tsconfig.json
```

### データフロー

```
Source.fetch() → IssueCandidate[] → 重複チェック → Issue作成 or コメント追加
```

## 共通インターフェース

### IssueCandidate

```ts
interface IssueCandidate {
  sourceType: "crashlytics" | "analytics" | "review" | "appstore-crash" | "submission"
  title: string
  body: string
  labels: string[]
  dedup:
    | { strategy: "merge"; key: string }
    | { strategy: "create-once"; key: string }
    | { strategy: "always-new" }
}
```

**dedup strategy 定義:**
- `merge`: 同一keyのIssueが存在すればコメント追加、なければ新規作成
- `create-once`: 同一keyのIssueが存在すればスキップ、なければ新規作成
- `always-new`: keyなし、常に新規Issue作成

### Source

```ts
interface Source {
  name: string
  fetch(): Promise<IssueCandidate[]>
}
```

## 重複チェック戦略

| ソース | strategy | key | 動作 |
|---|---|---|---|
| Crashlytics | `merge` | CrashlyticsのissueID | 既存Issueにコメント追加（発生回数更新） |
| Analytics | `create-once` | メトリクス名+日付(YYYY-MM-DD) | 同一メトリクス・同一日の異常は1 Issueのみ。翌日も継続していれば新規Issue作成 |
| レビュー | `create-once` | レビューID | 同一レビューIDが存在すればスキップ、なければ新規作成 |
| App Storeクラッシュ | `merge` | クラッシュシグネチャ | 既存Issueにコメント追加 |
| 審査結果 | `create-once` | バージョン+ステータス | 同一バージョン+ステータスが存在すればスキップ |

**重複検索方法**: GitHub Issues Search API
- クエリ: `label:"issue-forge:{sourceType}" {key} in:body`
- dedupキーはIssue本文にHTMLコメントで埋め込み: `<!-- issue-forge:key=xxx -->`

## 各ソース詳細

### 1. Firebase Crashlytics

- **API**: BigQuery Export経由（Firebase CrashlyticsにはパブリックREST APIが存在しないため）
- **前提**: Firebase ConsoleでCrashlyticsのBigQuery Exportを有効化済みであること
- **認証**: サービスアカウントJSON（BigQuery読み取り権限）
- **取得方法**: `@google-cloud/bigquery` SDKでcrashlyticsエクスポートテーブルをクエリ
- **取得対象**: 過去12時間の新規/未解決クラッシュ
- **Issue内容**: クラッシュタイトル、影響ユーザー数、スタックトレース、OS/デバイス分布

### 2. Firebase Analytics

- **API**: Google Analytics Data API (GA4)
- **認証**: 同じサービスアカウント
- **異常検出 Phase 1**: 固定閾値（config.tsで定義）
  - DAU前日比 -30% 以上の減少
  - エラーイベント率 5% 超
  - クラッシュフリーユーザー率 99% 未満
- **異常検出 Phase 2（将来）**: 過去7日の標準偏差ベース
- **Issue内容**: 異常メトリクス名、現在値、基準値、変化率

### 3. App Store Connect - レビュー

- **API**: App Store Connect API v1 (`/v1/apps/{id}/customerReviews`)
- **認証**: API Key (Issuer ID + Key ID + .p8秘密鍵) → JWT生成
- **取得対象**: 過去12時間の新着レビュー
- **Issue内容**: 星評価、タイトル、本文、レビュワー名、アプリバージョン

### 4. App Store Connect - クラッシュログ

- **API**: App Store Connect API
  1. `/v1/apps/{id}/diagnosticSignatures` でクラッシュシグネチャ一覧取得
  2. `/v1/diagnosticSignatures/{id}/logs` で個別ログ取得
- **認証**: 同上
- **取得対象**: 新規クラッシュシグネチャ
- **前提条件**: アプリがApp Storeに公開済みで、十分なユーザー数がある場合のみデータが存在する。データが取得できない場合は警告ログを出力してスキップする
- **Issue内容**: クラッシュシグネチャ、影響デバイス、OS、頻度

### 5. App Store Connect - 審査結果

- **API**: App Store Connect API (`/v1/apps/{id}/appStoreVersions`)
- **認証**: 同上
- **取得対象**: ステータス変更（特にRejected）
- **Issue内容**: バージョン、ステータス、リジェクトの場合はガイドライン番号（※Resolution Centerの詳細メッセージはAPIでは取得不可、ステータスとバージョン情報のみ）

## ラベル体系

```
issue-forge                    # 全自動Issue共通
issue-forge:crashlytics        # ソース識別
issue-forge:analytics
issue-forge:review
issue-forge:appstore-crash
issue-forge:submission
priority:critical              # 影響ユーザー多数
priority:normal
star:1 ~ star:5                # レビュー星評価
status:rejected                # 審査リジェクト
status:approved                # 審査承認
```

## Issueタイトル形式

```
[Crashlytics] EXC_BAD_ACCESS in AudioEngine.swift:142
[Analytics] DAU急落: -45% (前日比)
[Review] ★2 「録音が途中で止まる」
[AppStore Crash] Signal 11 in CoreAudio
[Submission] v2.1.0 Rejected - Guideline 2.1
```

## 設定ファイル

```ts
export const config = {
  app: {
    name: "1Take",
    bundleId: "com.hakaru.1Take",
    firebaseProjectId: "...",
    appStoreAppId: "...",
  },
  schedule: {
    intervalHours: 12,
  },
  analytics: {
    thresholds: {
      dauDropPercent: 30,
      errorRatePercent: 5,
      crashFreeUsersBelow: 99,
    }
  }
}
```

## シークレット (GitHub Secrets)

| Secret名 | 用途 |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | サービスアカウントJSON (Base64) — BigQuery + GA4両方で使用 |
| `ASC_ISSUER_ID` | App Store Connect Issuer ID |
| `ASC_KEY_ID` | App Store Connect Key ID |
| `ASC_PRIVATE_KEY` | App Store Connect .p8秘密鍵 |
| `GITHUB_TOKEN` | 自動提供（設定不要） |

## GitHub Actions ワークフロー

```yaml
name: IssueForge
on:
  schedule:
    - cron: '0 0,12 * * *'
  workflow_dispatch:
    inputs:
      source:
        description: '実行するソース（空欄=全部）'
        required: false
        type: choice
        options:
          - all
          - crashlytics
          - analytics
          - appstore-reviews
          - appstore-crashes
          - submission

jobs:
  run:
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd issue-forge && npm ci
      - run: cd issue-forge && npm run start
        env:
          FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          ASC_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
          ASC_KEY_ID: ${{ secrets.ASC_KEY_ID }}
          ASC_PRIVATE_KEY: ${{ secrets.ASC_PRIVATE_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SOURCE_FILTER: ${{ inputs.source || 'all' }}
```

## エラーハンドリング

- 各ソースはtry-catchで独立実行。1つ失敗しても他は続行
- 失敗ソースはGitHub Actionsログに警告出力（`core.warning()`）
- 全ソース失敗した場合のみワークフローをfailにする
- App Store Connect APIレート制限: 必要最小限のリクエストに絞る
- **リトライ方針**: 失敗時は次回の定期実行（12時間後）で自動リカバリ。状態管理は不要（各ソースは毎回「過去12時間分」を取得するため、dedup機構が重複を防ぐ）

### SOURCE_FILTER処理

- `all` または未指定: 全ソースを順次実行
- 個別ソース名: 該当ソースのみ実行
- 未知の値: 警告ログを出力し、全ソースを実行（フォールバック）

### ログ出力例

```
✓ Crashlytics: 2件の新規クラッシュ → 1 Issue作成, 1 Issue更新
✓ Analytics: 異常なし
✓ Reviews: 3件の新着レビュー → 3 Issue作成
✗ AppStore Crashes: API rate limit (次回リトライ)
✓ Submission: ステータス変更なし
```

## 将来の拡張

- 他アプリへの対応（config切り替え）
- Analytics Phase 2: 標準偏差ベースの異常検出
- サポートページ・メールからの取り込み
- Slack/Discord通知連携
