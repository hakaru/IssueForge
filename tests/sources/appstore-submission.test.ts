import { describe, it, expect } from "vitest";
import { formatSubmissionIssue, isRelevantStatusChange } from "../../src/sources/appstore-submission.js";

describe("formatSubmissionIssue", () => {
  it("formats a rejected version into IssueCandidate", () => {
    const version = { id: "ver-123", attributes: { versionString: "2.1.0", appStoreState: "REJECTED", createdDate: "2026-03-23T08:00:00Z" } };
    const result = formatSubmissionIssue(version, "issue-forge");
    expect(result.sourceType).toBe("submission");
    expect(result.title).toBe("[Submission] v2.1.0 Rejected");
    expect(result.labels).toContain("status:rejected");
    expect(result.labels).toContain("priority:critical");
    expect(result.dedup).toEqual({ strategy: "create-once", key: "2.1.0-REJECTED" });
  });

  it("formats an approved version into IssueCandidate", () => {
    const version = { id: "ver-456", attributes: { versionString: "2.1.0", appStoreState: "READY_FOR_DISTRIBUTION", createdDate: "2026-03-23T08:00:00Z" } };
    const result = formatSubmissionIssue(version, "issue-forge");
    expect(result.title).toBe("[Submission] v2.1.0 Approved");
    expect(result.labels).toContain("status:approved");
    expect(result.labels).not.toContain("priority:critical");
  });
});

describe("isRelevantStatusChange", () => {
  it("returns true for REJECTED", () => { expect(isRelevantStatusChange("REJECTED")).toBe(true); });
  it("returns true for READY_FOR_DISTRIBUTION", () => { expect(isRelevantStatusChange("READY_FOR_DISTRIBUTION")).toBe(true); });
  it("returns false for IN_REVIEW", () => { expect(isRelevantStatusChange("IN_REVIEW")).toBe(false); });
  it("returns false for WAITING_FOR_REVIEW", () => { expect(isRelevantStatusChange("WAITING_FOR_REVIEW")).toBe(false); });
});
