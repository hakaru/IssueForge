import { describe, it, expect } from "vitest";
import { formatCrashlyticsIssue } from "../../src/sources/crashlytics.js";
import type { IssueCandidate } from "../../src/types.js";

describe("formatCrashlyticsIssue", () => {
  it("formats a BigQuery crash row into IssueCandidate", () => {
    const row = {
      issue_id: "crash-abc123",
      issue_title: "EXC_BAD_ACCESS in AudioEngine.swift:142",
      event_count: 15,
      user_count: 8,
      first_seen: "2026-03-23T00:00:00Z",
      last_seen: "2026-03-23T06:00:00Z",
      sample_stack_trace: "0 AudioEngine.swift:142\n1 CoreAudio:88",
      os_version: "iOS 19.3",
      device_model: "iPhone 16",
    };
    const result: IssueCandidate = formatCrashlyticsIssue(row);
    expect(result.sourceType).toBe("crashlytics");
    expect(result.title).toBe("[Crashlytics] EXC_BAD_ACCESS in AudioEngine.swift:142");
    expect(result.labels).toContain("issue-forge");
    expect(result.labels).toContain("issue-forge:crashlytics");
    expect(result.dedup).toEqual({ strategy: "merge", key: "crash-abc123" });
    expect(result.body).toContain("影響ユーザー: 8");
    expect(result.body).toContain("発生回数: 15");
  });

  it("adds priority:critical label when user_count >= 10", () => {
    const row = {
      issue_id: "crash-xyz", issue_title: "Signal 11",
      event_count: 100, user_count: 50,
      first_seen: "2026-03-23T00:00:00Z", last_seen: "2026-03-23T06:00:00Z",
      sample_stack_trace: "trace", os_version: "iOS 19.3", device_model: "iPhone 16",
    };
    const result = formatCrashlyticsIssue(row);
    expect(result.labels).toContain("priority:critical");
  });
});
