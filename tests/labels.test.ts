import { describe, it, expect, vi } from "vitest";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
}));

import { ensureLabels, buildLabelDefinitions } from "../src/github/labels";

describe("buildLabelDefinitions", () => {
  it("generates labels with prefix", () => {
    const labels = buildLabelDefinitions("issue-forge");
    expect(labels).toContainEqual(expect.objectContaining({ name: "issue-forge" }));
    expect(labels).toContainEqual(expect.objectContaining({ name: "issue-forge:review" }));
    expect(labels).toContainEqual(expect.objectContaining({ name: "issue-forge:appstore-crash" }));
    expect(labels).toContainEqual(expect.objectContaining({ name: "issue-forge:submission" }));
  });

  it("uses custom prefix", () => {
    const labels = buildLabelDefinitions("my-prefix");
    expect(labels[0].name).toBe("my-prefix");
    expect(labels[1].name).toBe("my-prefix:review");
  });
});

describe("ensureLabels", () => {
  it("creates missing labels", async () => {
    const mockOctokit = {
      rest: { issues: {
        listLabelsForRepo: vi.fn().mockResolvedValue({ data: [] }),
        createLabel: vi.fn().mockResolvedValue({}),
      }},
    };
    await ensureLabels(mockOctokit as any, "owner", "repo", "issue-forge");
    expect(mockOctokit.rest.issues.createLabel).toHaveBeenCalled();
  });

  it("skips existing labels", async () => {
    const mockOctokit = {
      rest: { issues: {
        listLabelsForRepo: vi.fn().mockResolvedValue({
          data: [{ name: "issue-forge" }, { name: "issue-forge:review" },
                 { name: "issue-forge:appstore-crash" }, { name: "issue-forge:submission" }],
        }),
        createLabel: vi.fn().mockResolvedValue({}),
      }},
    };
    await ensureLabels(mockOctokit as any, "owner", "repo", "issue-forge");
    expect(mockOctokit.rest.issues.createLabel).not.toHaveBeenCalled();
  });
});
