import type { IssueCandidate, Source } from "../types.js";
import { generateAscToken } from "./asc-auth.js";

export interface AppStoreVersion {
  id: string;
  attributes: {
    versionString: string;
    appStoreState: string;
    createdDate: string;
  };
}

export const RELEVANT_STATES = new Set([
  "REJECTED",
  "READY_FOR_DISTRIBUTION",
  "DEVELOPER_REJECTED",
  "REMOVED_FROM_SALE",
]);

export function isRelevantStatusChange(state: string): boolean {
  return RELEVANT_STATES.has(state);
}

export function formatSubmissionIssue(version: AppStoreVersion, labelsPrefix: string = "issue-forge"): IssueCandidate {
  const { versionString, appStoreState, createdDate } = version.attributes;

  const isRejected = appStoreState === "REJECTED" || appStoreState === "DEVELOPER_REJECTED";
  const isApproved = appStoreState === "READY_FOR_DISTRIBUTION";

  const statusLabel = isRejected ? "status:rejected" : isApproved ? "status:approved" : `status:${appStoreState.toLowerCase()}`;
  const labels = [labelsPrefix, `${labelsPrefix}:submission`, statusLabel];

  if (isRejected) {
    labels.push("priority:critical");
  } else {
    labels.push("priority:normal");
  }

  let displayState: string;
  if (isRejected) {
    displayState = "Rejected";
  } else if (isApproved) {
    displayState = "Approved";
  } else {
    displayState = appStoreState;
  }

  const date = new Date(createdDate).toISOString().split("T")[0];

  let body = `## App Store 審査結果

| 項目 | 内容 |
|------|------|
| バージョン | v${versionString} |
| ステータス | ${appStoreState} |
| 日付 | ${date} |

`;

  if (isRejected) {
    body += `> **注意**: リジェクトされました。Resolution Center で詳細を確認してください。
> https://appstoreconnect.apple.com/apps
`;
  }

  return {
    sourceType: "submission",
    title: `[Submission] v${versionString} ${displayState}`,
    body,
    labels,
    dedup: { strategy: "create-once", key: `${versionString}-${appStoreState}` },
  };
}

export class AppStoreSubmissionSource implements Source {
  readonly name = "appstore-submission";

  constructor(
    private readonly appId: string,
    private readonly issuerId: string,
    private readonly keyId: string,
    private readonly privateKey: string,
    private readonly labelsPrefix: string = "issue-forge",
  ) {}

  async fetch(): Promise<IssueCandidate[]> {
    const token = generateAscToken(this.issuerId, this.keyId, this.privateKey);
    const url = `https://api.appstoreconnect.apple.com/v1/apps/${this.appId}/appStoreVersions?sort=-createdDate&limit=5`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`App Store Connect API error: ${response.status} ${response.statusText}${body ? ` — ${body}` : ""}`);
    }

    const data = (await response.json()) as { data: AppStoreVersion[] };
    return data.data
      .filter((v) => isRelevantStatusChange(v.attributes.appStoreState))
      .map((v) => formatSubmissionIssue(v, this.labelsPrefix));
  }
}
