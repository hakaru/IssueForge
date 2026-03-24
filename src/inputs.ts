import * as core from "@actions/core";
import type { ActionInputs } from "./types";

const VALID_SOURCES = new Set(["reviews", "crashes", "submission"]);
const LABELS_PREFIX_PATTERN = /^[a-zA-Z0-9_:-]+$/;

export function parseInputs(): ActionInputs {
  const appStoreAppId = core.getInput("app-store-app-id", { required: true });
  if (!/^\d+$/.test(appStoreAppId)) {
    throw new Error(`Invalid app-store-app-id: "${appStoreAppId}" (must be numeric)`);
  }

  const ascIssuerId = core.getInput("asc-issuer-id", { required: true });
  const ascKeyId = core.getInput("asc-key-id", { required: true });
  const ascPrivateKey = core.getInput("asc-private-key", { required: true });

  if (
    !ascPrivateKey.includes("-----BEGIN PRIVATE KEY-----") &&
    !ascPrivateKey.includes("-----BEGIN EC PRIVATE KEY-----")
  ) {
    throw new Error("asc-private-key does not appear to be a valid PEM private key");
  }

  core.setSecret(ascPrivateKey);
  core.setSecret(ascIssuerId);
  core.setSecret(ascKeyId);

  const sourcesRaw = core.getInput("sources") || "reviews,crashes,submission";
  const sources = sourcesRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => {
      if (VALID_SOURCES.has(s)) return true;
      core.warning(`Unknown source: "${s}" — skipping`);
      return false;
    });

  const githubToken = core.getInput("github-token") || process.env.GITHUB_TOKEN || "";

  const intervalHoursRaw = core.getInput("interval-hours") || "12";
  const intervalHours = Math.max(1, parseInt(intervalHoursRaw, 10) || 12);

  let labelsPrefix = core.getInput("labels-prefix") || "issue-forge";
  if (!LABELS_PREFIX_PATTERN.test(labelsPrefix)) {
    core.warning(`Invalid labels-prefix: "${labelsPrefix}" — using default "issue-forge"`);
    labelsPrefix = "issue-forge";
  }

  const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? "").split("/");
  if (!owner || !repo) {
    throw new Error("GITHUB_REPOSITORY is not set");
  }

  return { appStoreAppId, ascIssuerId, ascKeyId, ascPrivateKey, sources, githubToken, intervalHours, labelsPrefix, owner, repo };
}
