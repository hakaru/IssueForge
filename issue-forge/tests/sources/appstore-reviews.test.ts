import { describe, it, expect } from "vitest";
import { formatReviewIssue } from "../../src/sources/appstore-reviews.js";

describe("formatReviewIssue", () => {
  it("formats a review into IssueCandidate", () => {
    const review = {
      id: "rev-123",
      attributes: { rating: 2, title: "録音が途中で止まる", body: "3分以上録音すると必ず止まります", reviewerNickname: "音楽好き", createdDate: "2026-03-23T10:00:00Z" },
      relationships: { response: { data: null } },
    };
    const result = formatReviewIssue(review, "2.1.0");
    expect(result.sourceType).toBe("review");
    expect(result.title).toBe("[Review] ★2 「録音が途中で止まる」");
    expect(result.body).toContain("音楽好き");
    expect(result.body).toContain("v2.1.0");
    expect(result.labels).toContain("star:2");
    expect(result.labels).toContain("issue-forge:review");
    expect(result.dedup).toEqual({ strategy: "create-once", key: "rev-123" });
  });

  it("generates star label matching rating", () => {
    const review = { id: "rev-456", attributes: { rating: 5, title: "最高！", body: "素晴らしい", reviewerNickname: "user", createdDate: "2026-03-23T10:00:00Z" }, relationships: { response: { data: null } } };
    const result = formatReviewIssue(review, "1.0");
    expect(result.labels).toContain("star:5");
    expect(result.labels).not.toContain("priority:critical");
  });

  it("adds priority:critical for 1-star reviews", () => {
    const review = { id: "rev-789", attributes: { rating: 1, title: "ひどい", body: "動かない", reviewerNickname: "user", createdDate: "2026-03-23T10:00:00Z" }, relationships: { response: { data: null } } };
    const result = formatReviewIssue(review, "1.0");
    expect(result.labels).toContain("priority:critical");
  });
});
