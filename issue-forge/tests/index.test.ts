import { describe, it, expect, vi } from "vitest";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
  setFailed: vi.fn(),
}));

import { filterSources, runSources } from "../src/index.js";
import type { Source, IssueCandidate, SourceResult } from "../src/types.js";

function mockSource(name: string, candidates: IssueCandidate[]): Source {
  return { name, fetch: vi.fn().mockResolvedValue(candidates) };
}

function failingSource(name: string, error: string): Source {
  return { name, fetch: vi.fn().mockRejectedValue(new Error(error)) };
}

describe("filterSources", () => {
  // 実際のSourceクラスの .name プロパティに合わせたソース名を使用
  const sources = [
    mockSource("crashlytics", []),
    mockSource("analytics", []),
    mockSource("appstore-reviews", []),
  ];

  it("returns all sources for 'all'", () => {
    expect(filterSources(sources, "all")).toHaveLength(3);
  });

  it("filters to matching source name", () => {
    const filtered = filterSources(sources, "crashlytics");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("crashlytics");
  });

  it("returns all sources with warning for unknown filter", () => {
    const filtered = filterSources(sources, "unknown");
    expect(filtered).toHaveLength(3);
  });
});

describe("runSources", () => {
  it("collects results from all sources", async () => {
    const sources = [mockSource("crashlytics", []), mockSource("analytics", [])];
    const processCandidate = vi.fn().mockResolvedValue("created");
    const results = await runSources(sources, processCandidate);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it("continues when one source fails", async () => {
    const sources = [failingSource("crashlytics", "BigQuery error"), mockSource("analytics", [])];
    const processCandidate = vi.fn().mockResolvedValue("created");
    const results = await runSources(sources, processCandidate);
    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe("BigQuery error");
    expect(results[1].success).toBe(true);
  });

  it("reports all failed when every source fails", async () => {
    const sources = [failingSource("crashlytics", "error1"), failingSource("analytics", "error2")];
    const processCandidate = vi.fn().mockResolvedValue("created");
    const results = await runSources(sources, processCandidate);
    expect(results.every((r) => !r.success)).toBe(true);
  });
});
