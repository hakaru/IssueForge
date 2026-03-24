import { describe, it, expect, vi } from "vitest";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
  setFailed: vi.fn(),
  setOutput: vi.fn(),
  summary: { addRaw: vi.fn().mockReturnThis(), write: vi.fn().mockResolvedValue(undefined) },
}));

import { runSources, buildSummary } from "../src/index";
import type { Source, IssueCandidate, SourceResult } from "../src/types";

function mockSource(name: string, candidates: IssueCandidate[]): Source {
  return { name, fetch: vi.fn().mockResolvedValue(candidates) };
}

function failingSource(name: string): Source {
  return { name, fetch: vi.fn().mockRejectedValue(new Error("API error")) };
}

describe("runSources", () => {
  it("processes all sources and returns results", async () => {
    const processFn = vi.fn().mockResolvedValue("created");
    const results = await runSources(
      [mockSource("reviews", []), mockSource("crashes", [])],
      processFn
    );
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it("counts created/updated/skipped correctly", async () => {
    const candidate: IssueCandidate = {
      sourceType: "review",
      title: "test",
      body: "test",
      labels: [],
      dedup: { strategy: "create-once", key: "k1" },
    };
    const processFn = vi.fn()
      .mockResolvedValueOnce("created")
      .mockResolvedValueOnce("skipped")
      .mockResolvedValueOnce("created");

    const results = await runSources(
      [mockSource("reviews", [candidate, candidate, candidate])],
      processFn
    );
    expect(results[0].issuesCreated).toBe(2);
    expect(results[0].issuesSkipped).toBe(1);
  });

  it("continues when one source fails", async () => {
    const processFn = vi.fn().mockResolvedValue("created");
    const results = await runSources(
      [failingSource("reviews"), mockSource("crashes", [])],
      processFn
    );
    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe("API error");
    expect(results[1].success).toBe(true);
  });

  it("reports all failed when every source fails", async () => {
    const processFn = vi.fn();
    const results = await runSources(
      [failingSource("reviews"), failingSource("crashes")],
      processFn
    );
    expect(results.every((r) => !r.success)).toBe(true);
  });
});

describe("buildSummary", () => {
  it("generates markdown table", () => {
    const results: SourceResult[] = [
      { sourceName: "reviews", success: true, issuesCreated: 2, issuesUpdated: 0, issuesSkipped: 1 },
      { sourceName: "crashes", success: true, issuesCreated: 0, issuesUpdated: 1, issuesSkipped: 0 },
    ];
    const md = buildSummary(results);
    expect(md).toContain("| reviews |");
    expect(md).toContain("| **Total** |");
    expect(md).toContain("**2**");
  });

  it("marks failed sources", () => {
    const results: SourceResult[] = [
      { sourceName: "reviews", success: false, issuesCreated: 0, issuesUpdated: 0, issuesSkipped: 0, error: "fail" },
    ];
    const md = buildSummary(results);
    expect(md).toContain("fail");
  });
});
