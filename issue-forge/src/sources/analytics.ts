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

    // activeUsers, crashAffectedUsers, eventCount を取得してメトリクスを計算する
    const [response] = await client.runReport({
      property: `properties/${this.propertyId}`,
      dateRanges: [
        { startDate: "yesterday", endDate: "yesterday" },
        { startDate: "today", endDate: "today" },
      ],
      metrics: [
        { name: "activeUsers" },
        { name: "crashAffectedUsers" },
        { name: "crashFreeUsersRate" },
      ],
      dimensions: [
        { name: "dateRange" },
      ],
    });

    const yesterday: DailyMetrics = { dau: 0, errorRate: 0, crashFreeUsers: 100 };
    const today: DailyMetrics = { dau: 0, errorRate: 0, crashFreeUsers: 100 };

    if (response.rows) {
      for (const row of response.rows) {
        const dateRange = row.dimensionValues?.[0]?.value;
        const dau = Number(row.metricValues?.[0]?.value ?? 0);
        const crashAffectedUsers = Number(row.metricValues?.[1]?.value ?? 0);
        // crashFreeUsersRate は 0〜1 の小数で返るため %に変換
        const crashFreeRate = Number(row.metricValues?.[2]?.value ?? 1) * 100;
        // errorRate: クラッシュ影響ユーザー数 / アクティブユーザー数 * 100
        const errorRate = dau > 0 ? (crashAffectedUsers / dau) * 100 : 0;

        if (dateRange === "date_range_0") {
          yesterday.dau = dau;
          yesterday.errorRate = Number(errorRate.toFixed(2));
          yesterday.crashFreeUsers = Number(crashFreeRate.toFixed(2));
        } else if (dateRange === "date_range_1") {
          today.dau = dau;
          today.errorRate = Number(errorRate.toFixed(2));
          today.crashFreeUsers = Number(crashFreeRate.toFixed(2));
        }
      }
    }

    return detectAnomalies(today, yesterday, this.thresholds);
  }
}
