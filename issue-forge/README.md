# IssueForge

## 概要

Firebase および App Store Connect からフィードバックを自動収集し、GitHub Issue に変換する GitHub Actions ワークフローです。

クラッシュ・レビュー・審査結果などの情報を定期的に取得し、重複排除を行いながら Issue を作成・更新します。

---

## ソース

| ソース名 | データ取得元 | 概要 |
|----------|-------------|------|
| crashlytics | Firebase Crashlytics (BigQuery) | 当日発生したクラッシュを影響ユーザー数順に取得 |
| analytics | Google Analytics 4 (Data API) | DAU急落・エラー率上昇・クラッシュフリー率低下を検知 |
| appstore-reviews | App Store Connect API | 直近50件のカスタマーレビューを取得 |
| appstore-crashes | App Store Connect API (Diagnostic Signatures) | App Store 集計のクラッシュシグネチャを取得 |
| appstore-submission | App Store Connect API (App Store Versions) | 審査結果（承認・リジェクト等）を取得 |

---

## セットアップ

リポジトリの Settings > Secrets and variables > Actions に以下の4つのシークレットを登録します。

| シークレット名 | 内容 |
|---------------|------|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase サービスアカウントの JSON を Base64 エンコードした文字列 |
| `ASC_ISSUER_ID` | App Store Connect API の Issuer ID |
| `ASC_KEY_ID` | App Store Connect API のキー ID |
| `ASC_PRIVATE_KEY` | App Store Connect API の秘密鍵（PEM形式） |

`GITHUB_TOKEN` は Actions が自動的に提供するため、追加設定は不要です。

---

## Firebase 設定

### BigQuery Export の有効化

Crashlytics ソースは BigQuery にエクスポートされたデータを使用します。

1. Firebase Console を開く
2. 対象プロジェクトを選択する
3. 左メニューから Crashlytics を開く
4. 右上の「...」メニューから「BigQuery へのエクスポート」を有効化する
5. エクスポートが開始されると、BigQuery に `firebase_crashlytics` テーブルが作成される

有効化後、`config.ts` の `bigqueryDataset` にデータセット名を設定します。

### GA4 Property ID の確認方法

1. Google Analytics を開く
2. 管理 > プロパティ > プロパティの設定 を開く
3. 「プロパティ ID」に表示されている数値を確認する

確認した ID を `config.ts` の `ga4PropertyId` に設定します。

---

## App Store Connect 設定

### API キーの取得手順

1. App Store Connect にログインする
2. Users and Access を開く
3. Integrations > App Store Connect API を開く
4. 「Generate API Key」をクリックしてキーを生成する
5. 生成された Issuer ID・Key ID・秘密鍵（.p8ファイル）を取得する

取得した情報を以下のようにシークレットに登録します。

- Issuer ID → `ASC_ISSUER_ID`
- Key ID → `ASC_KEY_ID`
- .p8 ファイルの内容（`-----BEGIN PRIVATE KEY-----` を含む全文）→ `ASC_PRIVATE_KEY`

---

## 実行

### 自動実行

GitHub Actions のスケジュールにより、毎日 2 回自動実行されます。

| 実行タイミング (JST) | cron 設定 (UTC) |
|---------------------|----------------|
| 9:00 | `0 0 * * *` |
| 21:00 | `0 12 * * *` |

### 手動実行

1. リポジトリの Actions タブを開く
2. 左サイドバーから「IssueForge」を選択する
3. 「Run workflow」をクリックする
4. 実行するソースを選択する（`all` を選ぶと全ソースを実行）

---

## 設定変更

`issue-forge/src/config.ts` を編集して設定を変更します。

```typescript
export const config: Config = {
  app: {
    name: "アプリ名",
    bundleId: "com.example.app",
    firebaseProjectId: "firebase-project-id",
    ga4PropertyId: "000000000",          // GA4 プロパティ ID
    bigqueryDataset: "dataset_name",     // BigQuery データセット名
    appStoreAppId: "0000000000",         // App Store アプリ ID
  },
  analytics: {
    thresholds: {
      dauDropPercent: 30,         // DAU がこの割合(%)以上下落したら Issue を作成
      errorRatePercent: 5,        // エラー率がこの値(%)を超えたら Issue を作成
      crashFreeUsersBelow: 99,    // クラッシュフリー率がこの値(%)を下回ったら Issue を作成
    },
  },
};
```

---

## ラベル体系

すべての Issue に共通ラベルと、ソース・優先度を示すラベルが付与されます。

| ラベル | 説明 |
|--------|------|
| `issue-forge` | IssueForge が作成した Issue すべてに付与 |
| `issue-forge:crashlytics` | Crashlytics 由来のクラッシュ |
| `issue-forge:analytics` | GA4 の異常検知アラート |
| `issue-forge:review` | App Store カスタマーレビュー |
| `issue-forge:appstore-crash` | App Store 診断シグネチャのクラッシュ |
| `issue-forge:submission` | App Store 審査結果 |
| `priority:critical` | 高優先度（影響ユーザー 10 人以上 / 星 2 以下 / リジェクト等） |
| `priority:normal` | 通常優先度 |
| `star:1` ~ `star:5` | レビューの星評価 |
| `status:approved` | 審査通過 |
| `status:rejected` | 審査リジェクト |
