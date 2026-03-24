import * as core from "@actions/core";
import type { IssueCandidate, Source } from "../types.js";
import { generateAscToken } from "./asc-auth.js";

function sanitizeForMarkdown(text: string): string {
  return text
    .replace(/<!--/g, '&lt;!--')
    .replace(/-->/g, '--&gt;')
    .replace(/\|/g, '\\|');
}

export interface DiagnosticSignature {
  id: string;
  attributes: {
    diagnosticType: string;
    signature: string;
    weight: number;
  };
}

export function formatCrashIssue(sig: DiagnosticSignature, labelsPrefix: string = "issue-forge"): IssueCandidate {
  const { diagnosticType, weight } = sig.attributes;
  const signature = sanitizeForMarkdown(sig.attributes.signature);

  const labels = [labelsPrefix, `${labelsPrefix}:appstore-crash`];
  if (weight >= 50) {
    labels.push("priority:critical");
  } else {
    labels.push("priority:normal");
  }

  const body = `## App Store クラッシュレポート

| 項目 | 内容 |
|------|------|
| タイプ | ${diagnosticType} |
| シグネチャ | ${signature} |
| 重み | ${weight} |
| シグネチャID | ${sig.id} |
`;

  return {
    sourceType: "appstore-crash",
    title: `[AppStore Crash] ${signature}`,
    body,
    labels,
    dedup: { strategy: "merge", key: sig.id },
  };
}

export class AppStoreCrashesSource implements Source {
  readonly name = "appstore-crashes";

  constructor(
    private readonly appId: string,
    private readonly issuerId: string,
    private readonly keyId: string,
    private readonly privateKey: string,
    private readonly labelsPrefix: string = "issue-forge",
  ) {}

  async fetch(): Promise<IssueCandidate[]> {
    const token = generateAscToken(this.issuerId, this.keyId, this.privateKey);
    const url = `https://api.appstoreconnect.apple.com/v1/apps/${this.appId}/diagnosticSignatures?filter[diagnosticType]=CRASH&limit=50`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 404) {
      core.warning(`App Store diagnosticSignatures API returned 404 for app ${this.appId}. Skipping crash data.`);
      return [];
    }

    if (!response.ok) {
      throw new Error(`App Store Connect API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { data: DiagnosticSignature[] };
    return data.data.map((sig) => formatCrashIssue(sig, this.labelsPrefix));
  }
}
