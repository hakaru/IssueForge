import type { IssueCandidate, Source } from "../types.js";
import { generateAscToken } from "./asc-auth.js";

function sanitizeForMarkdown(text: string): string {
  return text
    .replace(/<!--/g, '&lt;!--')
    .replace(/-->/g, '--&gt;')
    .replace(/\|/g, '\\|');
}

export interface AppStoreReview {
  id: string;
  attributes: {
    rating: number;
    title: string;
    body: string;
    reviewerNickname: string;
    createdDate: string;
  };
  relationships: {
    response: { data: null | unknown };
  };
}

export function formatReviewIssue(review: AppStoreReview, appVersion: string, labelsPrefix: string = "issue-forge"): IssueCandidate {
  const { rating, createdDate } = review.attributes;
  const title = sanitizeForMarkdown(review.attributes.title);
  const body = sanitizeForMarkdown(review.attributes.body);
  const reviewerNickname = sanitizeForMarkdown(review.attributes.reviewerNickname);

  const labels = [labelsPrefix, `${labelsPrefix}:review`, `star:${rating}`];
  if (rating <= 2) {
    labels.push("priority:critical");
  } else {
    labels.push("priority:normal");
  }

  const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
  const date = new Date(createdDate).toISOString().split("T")[0];

  const issueBody = `## App Store レビュー

| 項目 | 内容 |
|------|------|
| 評価 | ${stars} (${rating}/5) |
| レビュアー | ${reviewerNickname} |
| バージョン | v${appVersion} |
| 日付 | ${date} |

## タイトル

${title}

## 本文

${body}
`;

  return {
    sourceType: "review",
    title: `[Review] ★${rating} 「${title}」`,
    body: issueBody,
    labels,
    dedup: { strategy: "create-once", key: review.id },
  };
}

export class AppStoreReviewsSource implements Source {
  readonly name = "appstore-reviews";

  constructor(
    private readonly appId: string,
    private readonly issuerId: string,
    private readonly keyId: string,
    private readonly privateKey: string,
    private readonly appVersion: string = "",
    private readonly intervalHours: number = 24,
    private readonly labelsPrefix: string = "issue-forge",
  ) {}

  async fetch(): Promise<IssueCandidate[]> {
    const token = generateAscToken(this.issuerId, this.keyId, this.privateKey);
    const url = `https://api.appstoreconnect.apple.com/v1/apps/${this.appId}/customerReviews?sort=-createdDate&limit=50`;
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

    const data = (await response.json()) as { data: AppStoreReview[] };
    const cutoff = Date.now() - this.intervalHours * 60 * 60 * 1000;
    return data.data
      .filter((review) => new Date(review.attributes.createdDate).getTime() >= cutoff)
      .map((review) => formatReviewIssue(review, this.appVersion, this.labelsPrefix));
  }
}
