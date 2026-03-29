import * as core from "@actions/core";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Source, IssueCandidate, SourceResult } from "./types.js";

// filterFilter文字列からソース名へのマッピング
// 値は各Sourceクラスの .name プロパティと一致させる
const nameMap: Record<string, string> = {
  crashlytics: "crashlytics",
  analytics: "analytics",
  "appstore-reviews": "appstore-reviews",
  "appstore-crashes": "appstore-crashes",
  submission: "appstore-submission",
};

export function filterSources(sources: Source[], filter: string): Source[] {
  if (filter === "all") {
    return sources;
  }

  const targetName = nameMap[filter.toLowerCase()];
  if (!targetName) {
    core.warning(`Unknown source filter: "${filter}". Running all sources.`);
    return sources;
  }

  return sources.filter((s) => s.name === targetName);
}

export async function runSources(
  sources: Source[],
  processFn: (candidate: IssueCandidate) => Promise<string>
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

      core.info(
        `[${source.name}] created=${created} updated=${updated} skipped=${skipped}`
      );
      results.push({
        sourceName: source.name,
        success: true,
        issuesCreated: created,
        issuesUpdated: updated,
        issuesSkipped: skipped,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      core.warning(`[${source.name}] failed: ${message}`);
      results.push({
        sourceName: source.name,
        success: false,
        issuesCreated: 0,
        issuesUpdated: 0,
        issuesSkipped: 0,
        error: message,
      });
    }
  }

  return results;
}

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");

  const firebaseSaBase64 = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!firebaseSaBase64) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");

  const firebaseSaJson = Buffer.from(firebaseSaBase64, "base64").toString("utf-8");
  const firebaseSa = JSON.parse(firebaseSaJson) as {
    project_id: string;
  };

  // ADC互換: サービスアカウントJSONを一時ファイルに書き出し GOOGLE_APPLICATION_CREDENTIALS を設定
  const tmpCredFile = path.join(os.tmpdir(), `firebase-sa-${process.pid}.json`);
  fs.writeFileSync(tmpCredFile, firebaseSaJson, { mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpCredFile;

  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit({ auth: token });

  const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? "").split("/");
  if (!owner || !repo) throw new Error("GITHUB_REPOSITORY is not set or invalid");

  const { config } = await import("./config.js");
  const { CrashlyticsSource } = await import("./sources/crashlytics.js");
  const { AnalyticsSource } = await import("./sources/analytics.js");
  const { AppStoreReviewsSource } = await import("./sources/appstore-reviews.js");
  const { AppStoreCrashesSource } = await import("./sources/appstore-crashes.js");
  const { AppStoreSubmissionSource } = await import("./sources/appstore-submission.js");
  const { generateAscToken } = await import("./sources/asc-auth.js");
  const { processCandidate } = await import("./github/issue-creator.js");

  const ascIssuerId = process.env.ASC_ISSUER_ID ?? "";
  const ascKeyId = process.env.ASC_KEY_ID ?? "";
  const ascPrivateKey = process.env.ASC_PRIVATE_KEY ?? "";
  const ascToken = generateAscToken(ascIssuerId, ascKeyId, ascPrivateKey);

  const sources: Source[] = [
    new CrashlyticsSource(firebaseSa.project_id, config.app.bigqueryDataset, config.app.crashlyticsTable),
    new AnalyticsSource(config.app.ga4PropertyId, config.analytics.thresholds),
    new AppStoreReviewsSource(config.app.appStoreAppId, ascToken, ""),
    new AppStoreCrashesSource(config.app.appStoreAppId, ascToken),
    new AppStoreSubmissionSource(config.app.appStoreAppId, ascToken),
  ];

  const filter = process.env.SOURCE_FILTER ?? "all";
  const filteredSources = filterSources(sources, filter);

  const processFn = (candidate: Parameters<typeof processCandidate>[3]) =>
    processCandidate(octokit, owner, repo, candidate);

  const results = await runSources(filteredSources, processFn);

  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    const names = failed.map((r) => r.sourceName).join(", ");
    core.warning(`Some sources failed: ${names}`);
  }

  const totalCreated = results.reduce((sum, r) => sum + r.issuesCreated, 0);
  const totalUpdated = results.reduce((sum, r) => sum + r.issuesUpdated, 0);
  core.info(`Done. created=${totalCreated} updated=${totalUpdated}`);
}

// テスト時（importされた場合）はmain()を実行しない
// npm run start 経由で実行された場合のみ起動する（ISSUE_FORGE_RUN=1 が設定される）
if (process.env.ISSUE_FORGE_RUN === "1") {
  main().catch((err) => {
    core.setFailed(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
