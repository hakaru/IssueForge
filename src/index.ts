import * as core from "@actions/core";
import { Octokit } from "@octokit/rest";
import type { Source, IssueCandidate, SourceResult } from "./types.js";
import { parseInputs } from "./inputs.js";
import { ensureLabels } from "./github/labels.js";
import { processCandidate } from "./github/issue-creator.js";
import { AppStoreReviewsSource } from "./sources/appstore-reviews.js";
import { AppStoreCrashesSource } from "./sources/appstore-crashes.js";
import { AppStoreSubmissionSource } from "./sources/appstore-submission.js";

type ProcessFn = (candidate: IssueCandidate) => Promise<string>;

export async function runSources(
  sources: Source[],
  processFn: ProcessFn
): Promise<SourceResult[]> {
  const results: SourceResult[] = [];

  for (const source of sources) {
    try {
      const candidates = await source.fetch();
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const candidate of candidates) {
        const result = await processFn(candidate);
        if (result === "created") created++;
        else if (result === "updated") updated++;
        else skipped++;
      }

      core.info(`[${source.name}] created=${created} updated=${updated} skipped=${skipped}`);
      results.push({ sourceName: source.name, success: true, issuesCreated: created, issuesUpdated: updated, issuesSkipped: skipped });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      core.warning(`[${source.name}] failed: ${message}`);
      results.push({ sourceName: source.name, success: false, issuesCreated: 0, issuesUpdated: 0, issuesSkipped: 0, error: message });
    }
  }

  return results;
}

export function buildSummary(results: SourceResult[]): string {
  let totalCreated = 0, totalUpdated = 0, totalSkipped = 0;
  const rows = results.map((r) => {
    totalCreated += r.issuesCreated;
    totalUpdated += r.issuesUpdated;
    totalSkipped += r.issuesSkipped;
    const status = r.success ? "" : ` (error: ${r.error})`;
    return `| ${r.sourceName}${status} | ${r.issuesCreated} | ${r.issuesUpdated} | ${r.issuesSkipped} |`;
  });

  return [
    "## IssueForge Results",
    "",
    "| Source | Created | Updated | Skipped |",
    "|--------|---------|---------|---------|",
    ...rows,
    `| **Total** | **${totalCreated}** | **${totalUpdated}** | **${totalSkipped}** |`,
  ].join("\n");
}

async function main(): Promise<void> {
  const inputs = parseInputs();
  const octokit = new Octokit({ auth: inputs.githubToken });

  // Ensure labels exist
  await ensureLabels(octokit, inputs.owner, inputs.repo, inputs.labelsPrefix);

  // Build source array based on enabled sources
  const sourceMap: Record<string, () => Source> = {
    reviews: () => new AppStoreReviewsSource(
      inputs.appStoreAppId, inputs.ascIssuerId, inputs.ascKeyId, inputs.ascPrivateKey,
      "", inputs.intervalHours, inputs.labelsPrefix
    ),
    crashes: () => new AppStoreCrashesSource(
      inputs.appStoreAppId, inputs.ascIssuerId, inputs.ascKeyId, inputs.ascPrivateKey,
      inputs.labelsPrefix
    ),
    submission: () => new AppStoreSubmissionSource(
      inputs.appStoreAppId, inputs.ascIssuerId, inputs.ascKeyId, inputs.ascPrivateKey,
      inputs.labelsPrefix
    ),
  };

  const sources = inputs.sources
    .filter((s) => s in sourceMap)
    .map((s) => sourceMap[s]());

  core.info(`IssueForge: ${sources.length} sources enabled (${inputs.sources.join(", ")})`);

  // Run all sources
  const processFn: ProcessFn = (candidate) =>
    processCandidate(octokit, inputs.owner, inputs.repo, candidate);
  const results = await runSources(sources, processFn);

  // Set outputs
  const totalCreated = results.reduce((sum, r) => sum + r.issuesCreated, 0);
  const totalUpdated = results.reduce((sum, r) => sum + r.issuesUpdated, 0);
  const totalSkipped = results.reduce((sum, r) => sum + r.issuesSkipped, 0);
  core.setOutput("issues-created", totalCreated.toString());
  core.setOutput("issues-updated", totalUpdated.toString());
  core.setOutput("issues-skipped", totalSkipped.toString());

  // Write summary
  const summary = buildSummary(results);
  core.info(`Done. created=${totalCreated} updated=${totalUpdated} skipped=${totalSkipped}`);
  await core.summary.addRaw(summary).write();

  // Fail if all sources failed
  const allFailed = results.length > 0 && results.every((r) => !r.success);
  if (allFailed) {
    core.setFailed("All sources failed");
  }
}

// Only run main() when not in test environment
if (!process.env.VITEST) {
  main().catch((err) => {
    core.setFailed(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
