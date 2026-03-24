import { describe, it, expect } from "vitest";
import { formatCrashIssue } from "../../src/sources/appstore-crashes.js";

describe("formatCrashIssue", () => {
  it("formats a diagnostic signature into IssueCandidate", () => {
    const sig = { id: "sig-abc", attributes: { diagnosticType: "CRASH", signature: "Signal 11 in CoreAudio", weight: 42.5 } };
    const result = formatCrashIssue(sig, "issue-forge");
    expect(result.sourceType).toBe("appstore-crash");
    expect(result.title).toBe("[AppStore Crash] Signal 11 in CoreAudio");
    expect(result.labels).toContain("issue-forge:appstore-crash");
    expect(result.dedup).toEqual({ strategy: "merge", key: "sig-abc" });
    expect(result.body).toContain("42.5");
  });

  it("adds priority:critical for high weight crashes", () => {
    const sig = { id: "sig-xyz", attributes: { diagnosticType: "CRASH", signature: "EXC_BAD_ACCESS", weight: 60 } };
    const result = formatCrashIssue(sig, "issue-forge");
    expect(result.labels).toContain("priority:critical");
  });
});
