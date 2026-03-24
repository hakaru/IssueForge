import { describe, it, expect, vi } from "vitest";
import { processCandidate } from "../src/github/issue-creator.js";
import type { IssueCandidate } from "../src/types.js";

function createMockOctokit(searchResults: any[] = []) {
  return {
    rest: {
      search: {
        issuesAndPullRequests: vi.fn().mockResolvedValue({
          data: { total_count: searchResults.length, items: searchResults },
        }),
      },
      issues: {
        create: vi.fn().mockResolvedValue({ data: { number: 99 } }),
        createComment: vi.fn().mockResolvedValue({ data: {} }),
      },
    },
  };
}

describe("processCandidate", () => {
  const owner = "hakaru";
  const repo = "1Take";

  it("creates new issue for merge strategy when no existing issue", async () => {
    const octokit = createMockOctokit([]);
    const candidate: IssueCandidate = {
      sourceType: "crashlytics",
      title: "[Crashlytics] EXC_BAD_ACCESS",
      body: "Stack trace...",
      labels: ["issue-forge", "issue-forge:crashlytics"],
      dedup: { strategy: "merge", key: "crash-123" },
    };
    const result = await processCandidate(octokit as any, owner, repo, candidate);
    expect(result).toBe("created");
    expect(octokit.rest.issues.create).toHaveBeenCalledOnce();
  });

  it("adds comment for merge strategy when existing issue found", async () => {
    const octokit = createMockOctokit([
      { number: 42, body: "<!-- issue-forge:crashlytics:crash-123 -->" },
    ]);
    const candidate: IssueCandidate = {
      sourceType: "crashlytics",
      title: "[Crashlytics] EXC_BAD_ACCESS",
      body: "Updated stack trace...",
      labels: ["issue-forge", "issue-forge:crashlytics"],
      dedup: { strategy: "merge", key: "crash-123" },
    };
    const result = await processCandidate(octokit as any, owner, repo, candidate);
    expect(result).toBe("updated");
    expect(octokit.rest.issues.createComment).toHaveBeenCalledOnce();
  });

  it("skips for create-once strategy when existing issue found", async () => {
    const octokit = createMockOctokit([
      { number: 42, body: "<!-- issue-forge:review:rev-456 -->" },
    ]);
    const candidate: IssueCandidate = {
      sourceType: "review",
      title: "[Review] ★2",
      body: "Review text",
      labels: ["issue-forge", "issue-forge:review"],
      dedup: { strategy: "create-once", key: "rev-456" },
    };
    const result = await processCandidate(octokit as any, owner, repo, candidate);
    expect(result).toBe("skipped");
    expect(octokit.rest.issues.create).not.toHaveBeenCalled();
  });

  it("always creates for always-new strategy without searching", async () => {
    const octokit = createMockOctokit([]);
    const candidate: IssueCandidate = {
      sourceType: "analytics",
      title: "[Analytics] DAU急落",
      body: "DAU dropped 45%",
      labels: ["issue-forge", "issue-forge:analytics"],
      dedup: { strategy: "always-new" },
    };
    const result = await processCandidate(octokit as any, owner, repo, candidate);
    expect(result).toBe("created");
    expect(octokit.rest.search.issuesAndPullRequests).not.toHaveBeenCalled();
  });
});
