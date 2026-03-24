import * as core from "@actions/core";
import type { Octokit } from "@octokit/rest";

interface LabelDef {
  name: string;
  color: string;
  description: string;
}

export function buildLabelDefinitions(prefix: string): LabelDef[] {
  return [
    { name: prefix, color: "0366d6", description: "Auto-created by IssueForge" },
    { name: `${prefix}:review`, color: "fbca04", description: "App Store review" },
    { name: `${prefix}:appstore-crash`, color: "d93f0b", description: "App Store crash" },
    { name: `${prefix}:submission`, color: "5319e7", description: "App Store submission" },
  ];
}

export async function ensureLabels(
  octokit: Octokit, owner: string, repo: string, prefix: string
): Promise<void> {
  const needed = buildLabelDefinitions(prefix);
  const { data: existing } = await octokit.rest.issues.listLabelsForRepo({ owner, repo, per_page: 100 });
  const existingNames = new Set(existing.map((l) => l.name));

  for (const label of needed) {
    if (existingNames.has(label.name)) continue;
    try {
      await octokit.rest.issues.createLabel({ owner, repo, ...label });
      core.info(`Created label: ${label.name}`);
    } catch (err) {
      core.warning(`Failed to create label "${label.name}": ${err instanceof Error ? err.message : err}`);
    }
  }
}
