// tests/dedup.test.ts
import { describe, it, expect, vi } from "vitest";
import { findExistingIssue, buildDedupMarker, extractDedupKey } from "../src/github/dedup.js";

describe("buildDedupMarker", () => {
  it("creates HTML comment with source and key", () => {
    const marker = buildDedupMarker("crashlytics", "crash-123");
    expect(marker).toBe("<!-- issue-forge:crashlytics:crash-123 -->");
  });
});

describe("extractDedupKey", () => {
  it("extracts key from body with marker", () => {
    const body = "Some text\n<!-- issue-forge:crashlytics:crash-123 -->\nMore text";
    expect(extractDedupKey(body, "crashlytics")).toBe("crash-123");
  });

  it("returns null when no marker found", () => {
    expect(extractDedupKey("no marker here", "crashlytics")).toBeNull();
  });
});

describe("findExistingIssue", () => {
  it("returns issue number when match found", async () => {
    const mockOctokit = {
      rest: {
        search: {
          issuesAndPullRequests: vi.fn().mockResolvedValue({
            data: {
              total_count: 1,
              items: [{ number: 42, body: "<!-- issue-forge:crashlytics:crash-123 -->" }],
            },
          }),
        },
      },
    };
    const result = await findExistingIssue(mockOctokit as any, "hakaru", "1Take", "crashlytics", "crash-123");
    expect(result).toBe(42);
  });

  it("returns null when no match found", async () => {
    const mockOctokit = {
      rest: {
        search: {
          issuesAndPullRequests: vi.fn().mockResolvedValue({
            data: { total_count: 0, items: [] },
          }),
        },
      },
    };
    const result = await findExistingIssue(mockOctokit as any, "hakaru", "1Take", "crashlytics", "crash-123");
    expect(result).toBeNull();
  });
});
