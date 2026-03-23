import type { IssueCandidate, Source } from "../types.js";

export interface CrashlyticsRow {
  issue_id: string;
  issue_title: string;
  event_count: number;
  user_count: number;
  first_seen: string;
  last_seen: string;
  sample_stack_trace: string;
  os_version: string;
  device_model: string;
}

export function formatCrashlyticsIssue(row: CrashlyticsRow): IssueCandidate {
  const labels = ["issue-forge", "issue-forge:crashlytics"];
  if (row.user_count >= 10) {
    labels.push("priority:critical");
  } else {
    labels.push("priority:normal");
  }

  const body = `## Crashlytics クラッシュレポート

- 影響ユーザー: ${row.user_count}
- 発生回数: ${row.event_count}
- 初回発生: ${row.first_seen}
- 最終発生: ${row.last_seen}
- OSバージョン: ${row.os_version}
- デバイス: ${row.device_model}


## スタックトレース

\`\`\`
${row.sample_stack_trace}
\`\`\`
`;

  return {
    sourceType: "crashlytics",
    title: `[Crashlytics] ${row.issue_title}`,
    body,
    labels,
    dedup: { strategy: "merge", key: row.issue_id },
  };
}

export class CrashlyticsSource implements Source {
  readonly name = "crashlytics";

  constructor(
    private readonly projectId: string,
    private readonly dataset: string,
  ) {}

  async fetch(): Promise<IssueCandidate[]> {
    const { BigQuery } = await import("@google-cloud/bigquery");
    const bq = new BigQuery({ projectId: this.projectId });

    const query = `
      SELECT
        issue_id,
        issue_title,
        COUNT(*) AS event_count,
        COUNT(DISTINCT installation_uuid) AS user_count,
        MIN(event_timestamp) AS first_seen,
        MAX(event_timestamp) AS last_seen,
        ANY_VALUE(stacktrace) AS sample_stack_trace,
        ANY_VALUE(os_display_version) AS os_version,
        ANY_VALUE(device_model) AS device_model
      FROM \`${this.projectId}.${this.dataset}.firebase_crashlytics\`
      WHERE DATE(event_timestamp) = CURRENT_DATE()
      GROUP BY issue_id, issue_title
      ORDER BY user_count DESC
      LIMIT 50
    `;

    const [rows] = await bq.query({ query });
    return (rows as CrashlyticsRow[]).map(formatCrashlyticsIssue);
  }
}
