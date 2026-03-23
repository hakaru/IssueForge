import type { IssueCandidate, AnalyticsThresholds, Source } from "../types.js";

export interface DailyMetrics {
  dau: number;
  errorRate: number;
  crashFreeUsers: number;
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function detectAnomalies(
  today: DailyMetrics,
  yesterday: DailyMetrics,
  thresholds: AnalyticsThresholds,
): IssueCandidate[] {
  const anomalies: IssueCandidate[] = [];
  const date = todayString();
  const labels = ["issue-forge", "issue-forge:analytics", "priority:critical"];

  // DAUドロップチェック
  if (yesterday.dau > 0) {
    const dropPercent = ((yesterday.dau - today.dau) / yesterday.dau) * 100;
    if (dropPercent >= thresholds.dauDropPercent) {
      anomalies.push({
        sourceType: "analytics",
        title: `[Analytics] DAU が ${dropPercent.toFixed(1)}% 急落しました`,
        body: `## DAU 急落アラート

- 昨日のDAU: ${yesterday.dau}
- 今日のDAU: ${today.dau}
- 下落率: ${dropPercent.toFixed(1)}%
- しきい値: ${thresholds.dauDropPercent}%
`,
        labels: [...labels],
        dedup: { strategy: "create-once", key: `dau-drop-${date}` },
      });
    }
  }

  // エラー率チェック
  if (today.errorRate > thresholds.errorRatePercent) {
    anomalies.push({
      sourceType: "analytics",
      title: `[Analytics] エラー率が ${today.errorRate}% に上昇しました`,
      body: `## エラー率上昇アラート

- 現在のエラー率: ${today.errorRate}%
- しきい値: ${thresholds.errorRatePercent}%
- 昨日のエラー率: ${yesterday.errorRate}%
`,
      labels: [...labels],
      dedup: { strategy: "create-once", key: `error-rate-${date}` },
    });
  }

  // クラッシュフリー率チェック
  if (today.crashFreeUsers < thresholds.crashFreeUsersBelow) {
    anomalies.push({
      sourceType: "analytics",
      title: `[Analytics] クラッシュフリー率が ${today.crashFreeUsers}% に低下しました`,
      body: `## クラッシュフリー率低下アラート

- 現在のクラッシュフリー率: ${today.crashFreeUsers}%
- しきい値: ${thresholds.crashFreeUsersBelow}%
- 昨日のクラッシュフリー率: ${yesterday.crashFreeUsers}%
`,
      labels: [...labels],
      dedup: { strategy: "create-once", key: `crash-free-${date}` },
    });
  }

  return anomalies;
}

export class AnalyticsSource implements Source {
  readonly name = "analytics";

  constructor(
    private readonly propertyId: string,
    private readonly thresholds: AnalyticsThresholds,
  ) {}

  async fetch(): Promise<IssueCandidate[]> {
    const { BetaAnalyticsDataClient } = await import("@google-analytics/data");
    const client = new BetaAnalyticsDataClient();

    const [response] = await client.runReport({
      property: `properties/${this.propertyId}`,
      dateRanges: [
        { startDate: "yesterday", endDate: "yesterday" },
        { startDate: "today", endDate: "today" },
      ],
      metrics: [
        { name: "activeUsers" },
      ],
    });

    // GA4 APIのレスポンスを解析してDailyMetricsに変換
    // 実装は本番環境の実際のデータ構造に合わせて調整が必要
    const yesterday: DailyMetrics = { dau: 0, errorRate: 0, crashFreeUsers: 100 };
    const today: DailyMetrics = { dau: 0, errorRate: 0, crashFreeUsers: 100 };

    if (response.rows) {
      for (const row of response.rows) {
        const dateRange = row.dimensionValues?.[0]?.value;
        const dau = Number(row.metricValues?.[0]?.value ?? 0);
        if (dateRange === "date_range_0") {
          yesterday.dau = dau;
        } else if (dateRange === "date_range_1") {
          today.dau = dau;
        }
      }
    }

    return detectAnomalies(today, yesterday, this.thresholds);
  }
}
