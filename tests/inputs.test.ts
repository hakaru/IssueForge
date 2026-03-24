import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@actions/core", () => ({
  getInput: vi.fn(),
  setSecret: vi.fn(),
  setFailed: vi.fn(),
  warning: vi.fn(),
}));

import * as core from "@actions/core";
import { parseInputs } from "../src/inputs";

describe("parseInputs", () => {
  beforeEach(() => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        "app-store-app-id": "6757945099",
        "asc-issuer-id": "issuer-123",
        "asc-key-id": "KEY123",
        "asc-private-key": "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
        "sources": "reviews,crashes,submission",
        "github-token": "ghp_test",
        "interval-hours": "12",
        "labels-prefix": "issue-forge",
      };
      return inputs[name] ?? "";
    });
    process.env.GITHUB_REPOSITORY = "hakaru/1Take";
  });

  it("parses valid inputs", () => {
    const inputs = parseInputs();
    expect(inputs.appStoreAppId).toBe("6757945099");
    expect(inputs.sources).toEqual(["reviews", "crashes", "submission"]);
    expect(inputs.intervalHours).toBe(12);
    expect(inputs.owner).toBe("hakaru");
    expect(inputs.repo).toBe("1Take");
  });

  it("calls setSecret for private key", () => {
    parseInputs();
    expect(core.setSecret).toHaveBeenCalled();
  });

  it("throws for non-numeric app-store-app-id", () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === "app-store-app-id") return "abc";
      if (name === "asc-private-key") return "-----BEGIN PRIVATE KEY-----\ntest";
      return "valid";
    });
    process.env.GITHUB_REPOSITORY = "o/r";
    expect(() => parseInputs()).toThrow();
  });

  it("filters unknown source names with warning", () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === "sources") return "reviews,unknown,crashes";
      if (name === "app-store-app-id") return "123";
      if (name === "asc-private-key") return "-----BEGIN PRIVATE KEY-----\ntest";
      return "valid";
    });
    process.env.GITHUB_REPOSITORY = "o/r";
    const inputs = parseInputs();
    expect(inputs.sources).toEqual(["reviews", "crashes"]);
    expect(core.warning).toHaveBeenCalled();
  });

  it("falls back to default interval-hours for invalid value", () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === "interval-hours") return "abc";
      if (name === "app-store-app-id") return "123";
      if (name === "asc-private-key") return "-----BEGIN PRIVATE KEY-----\ntest";
      return "valid";
    });
    process.env.GITHUB_REPOSITORY = "o/r";
    const inputs = parseInputs();
    expect(inputs.intervalHours).toBe(12);
  });

  it("falls back to default labels-prefix for invalid characters", () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === "labels-prefix") return "bad/prefix<>";
      if (name === "app-store-app-id") return "123";
      if (name === "asc-private-key") return "-----BEGIN PRIVATE KEY-----\ntest";
      return "valid";
    });
    process.env.GITHUB_REPOSITORY = "o/r";
    const inputs = parseInputs();
    expect(inputs.labelsPrefix).toBe("issue-forge");
  });
});
