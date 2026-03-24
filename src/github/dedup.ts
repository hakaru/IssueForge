// src/github/dedup.ts
import type { Octokit } from "@octokit/rest";
import type { SourceType } from "../types.js";

export function buildDedupMarker(sourceType: SourceType, key: string): string {
  return `<!-- issue-forge:${sourceType}:${key} -->`;
}

export function extractDedupKey(body: string, sourceType: SourceType): string | null {
  const pattern = new RegExp(`<!-- issue-forge:${sourceType}:(.+?) -->`);
  const match = body.match(pattern);
  return match ? match[1] : null;
}

export async function findExistingIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  sourceType: SourceType,
  key: string
): Promise<number | null> {
  const marker = buildDedupMarker(sourceType, key);
  const q = `repo:${owner}/${repo} is:issue is:open label:"issue-forge:${sourceType}" "${marker}" in:body`;

  const { data } = await octokit.rest.search.issuesAndPullRequests({
    q,
    per_page: 1,
  });

  if (data.total_count > 0 && data.items.length > 0) {
    return data.items[0].number;
  }
  return null;
}
