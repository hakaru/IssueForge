import type { Octokit } from "@octokit/rest";
import type { IssueCandidate } from "../types.js";
import { buildDedupMarker, findExistingIssue } from "./dedup.js";

export type ProcessResult = "created" | "updated" | "skipped";

export async function processCandidate(
  octokit: Octokit,
  owner: string,
  repo: string,
  candidate: IssueCandidate
): Promise<ProcessResult> {
  const { dedup } = candidate;

  if (dedup.strategy === "always-new") {
    await createIssue(octokit, owner, repo, candidate);
    return "created";
  }

  const existingIssueNumber = await findExistingIssue(
    octokit, owner, repo, candidate.sourceType, dedup.key
  );

  if (existingIssueNumber !== null) {
    if (dedup.strategy === "merge") {
      await octokit.rest.issues.createComment({
        owner, repo, issue_number: existingIssueNumber,
        body: `## Update\n\n${candidate.body}`,
      });
      return "updated";
    }
    return "skipped";
  }

  await createIssue(octokit, owner, repo, candidate);
  return "created";
}

async function createIssue(
  octokit: Octokit, owner: string, repo: string, candidate: IssueCandidate
): Promise<void> {
  const marker = candidate.dedup.strategy !== "always-new"
    ? `\n\n${buildDedupMarker(candidate.sourceType, candidate.dedup.key)}`
    : "";

  await octokit.rest.issues.create({
    owner, repo, title: candidate.title,
    body: `${candidate.body}${marker}`,
    labels: candidate.labels,
  });
}
