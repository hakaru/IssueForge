import { describe, it, expectTypeOf } from "vitest";
import type { IssueCandidate, Source, SourceType } from "../src/types.js";

describe("IssueCandidate type", () => {
  it("accepts merge strategy with key", () => {
    const candidate: IssueCandidate = {
      sourceType: "crashlytics",
      title: "EXC_BAD_ACCESS",
      body: "stack trace...",
      labels: ["issue-forge", "issue-forge:crashlytics"],
      dedup: { strategy: "merge", key: "crash-123" },
    };
    expectTypeOf(candidate).toMatchTypeOf<IssueCandidate>();
  });

  it("accepts create-once strategy with key", () => {
    const candidate: IssueCandidate = {
      sourceType: "review",
      title: "★2 review",
      body: "content",
      labels: ["issue-forge", "issue-forge:review"],
      dedup: { strategy: "create-once", key: "review-456" },
    };
    expectTypeOf(candidate).toMatchTypeOf<IssueCandidate>();
  });

  it("accepts always-new strategy without key", () => {
    const candidate: IssueCandidate = {
      sourceType: "analytics",
      title: "DAU drop",
      body: "content",
      labels: ["issue-forge", "issue-forge:analytics"],
      dedup: { strategy: "always-new" },
    };
    expectTypeOf(candidate).toMatchTypeOf<IssueCandidate>();
  });
});
