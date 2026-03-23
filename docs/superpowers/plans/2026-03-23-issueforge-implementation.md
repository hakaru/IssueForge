# IssueForge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a GitHub Actions-based tool that collects feedback from Firebase Crashlytics, Firebase Analytics, and App Store Connect, then creates GitHub Issues automatically in the `hakaru/1Take` repository.

**Architecture:** Monolithic GitHub Actions workflow running TypeScript (Node.js 20). Each source implements a common `Source` interface, producing `IssueCandidate[]`. A shared dedup/issue-creator layer handles GitHub Issue creation with three strategies: merge, create-once, always-new.

**Tech Stack:** TypeScript, Node.js 20, `@google-cloud/bigquery`, `@google-analytics/data`, `jsonwebtoken` (ASC JWT), `@octokit/rest`, `@actions/core`, Vitest for testing.

---

## File Structure

```
issue-forge/
├── src/
│   ├── index.ts                    # エントリポイント: ソースフィルタ→順次実行→結果ログ
│   ├── types.ts                    # IssueCandidate, Source, Config 型定義
│   ├── config.ts                   # アプリ設定、閾値、ラベル定義
│   ├── sources/
│   │   ├── crashlytics.ts          # BigQuery経由のCrashlyticsデータ取得
│   │   ├── analytics.ts            # GA4 Data API経由の異常検出
│   │   ├── appstore-reviews.ts     # ASC API経由のレビュー取得
│   │   ├── appstore-crashes.ts     # ASC API経由のクラッシュシグネチャ取得
│   │   ├── appstore-submission.ts  # ASC API経由の審査ステータス取得
│   │   └── asc-auth.ts             # App Store Connect JWT生成（共通）
│   └── github/
│       ├── issue-creator.ts        # Issue作成・コメント追加
│       └── dedup.ts                # 重複チェック（GitHub Search API）
├── tests/
│   ├── types.test.ts
│   ├── dedup.test.ts
│   ├── issue-creator.test.ts
│   ├── sources/
│   │   ├── crashlytics.test.ts
│   │   ├── analytics.test.ts
│   │   ├── appstore-reviews.test.ts
│   │   ├── appstore-crashes.test.ts
│   │   ├── appstore-submission.test.ts
│   │   └── asc-auth.test.ts
│   └── index.test.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

Additionally in the 1Take repo root:
```
.github/workflows/issue-forge.yml
```

---

### Task 1: プロジェクト初期化 + 型定義

**Files:**
- Create: `issue-forge/package.json`
- Create: `issue-forge/tsconfig.json`
- Create: `issue-forge/vitest.config.ts`
- Create: `issue-forge/src/types.ts`
- Create: `issue-forge/tests/types.test.ts`

- [ ] **Step 1: package.json作成**

```json
{
  "name": "issue-forge",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@actions/core": "^1.10.1",
    "@google-cloud/bigquery": "^7.5.0",
    "@google-analytics/data": "^4.4.0",
    "@octokit/rest": "^20.0.2",
    "jsonwebtoken": "^9.0.2"
  },
  "devDependencies": {
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^20.11.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0"
  }
}
```

- [ ] **Step 2: tsconfig.json作成**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src", "tests"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: vitest.config.ts作成**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
```

- [ ] **Step 4: npm install実行**

Run: `cd issue-forge && npm install`
Expected: `node_modules` ディレクトリが作成される

- [ ] **Step 5: types.tsの型テストを書く**

```ts
// tests/types.test.ts
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
```

- [ ] **Step 6: テスト実行して失敗確認**

Run: `cd issue-forge && npx vitest run tests/types.test.ts`
Expected: FAIL — `../src/types.js` が見つからない

- [ ] **Step 7: types.ts実装**

```ts
// src/types.ts
export type SourceType =
  | "crashlytics"
  | "analytics"
  | "review"
  | "appstore-crash"
  | "submission";

export type DedupConfig =
  | { strategy: "merge"; key: string }
  | { strategy: "create-once"; key: string }
  | { strategy: "always-new" };

export interface IssueCandidate {
  sourceType: SourceType;
  title: string;
  body: string;
  labels: string[];
  dedup: DedupConfig;
}

export interface Source {
  name: string;
  fetch(): Promise<IssueCandidate[]>;
}

export interface AppConfig {
  name: string;
  bundleId: string;
  firebaseProjectId: string;
  ga4PropertyId: string;
  bigqueryDataset: string;
  appStoreAppId: string;
}

export interface AnalyticsThresholds {
  dauDropPercent: number;
  errorRatePercent: number;
  crashFreeUsersBelow: number;
}

export interface Config {
  app: AppConfig;
  schedule: { intervalHours: number };
  analytics: { thresholds: AnalyticsThresholds };
}

export interface SourceResult {
  sourceName: string;
  success: boolean;
  issuesCreated: number;
  issuesUpdated: number;
  issuesSkipped: number;
  error?: string;
}
```

- [ ] **Step 8: テスト実行してパス確認**

Run: `cd issue-forge && npx vitest run tests/types.test.ts`
Expected: PASS

- [ ] **Step 9: コミット**

```bash
git add issue-forge/package.json issue-forge/tsconfig.json issue-forge/vitest.config.ts issue-forge/src/types.ts issue-forge/tests/types.test.ts issue-forge/package-lock.json
git commit -m "feat: initialize project and define core types"
```

---

### Task 2: config.ts

**Files:**
- Create: `issue-forge/src/config.ts`

- [ ] **Step 1: config.ts作成**

```ts
// src/config.ts
import type { Config } from "./types.js";

export const config: Config = {
  app: {
    name: "1Take",
    bundleId: "com.hakaru.1Take",
    firebaseProjectId: "", // Set via env or fill in
    ga4PropertyId: "",     // GA4 property ID
    bigqueryDataset: "",   // e.g. "firebase_crashlytics"
    appStoreAppId: "",     // App Store app ID
  },
  schedule: {
    intervalHours: 12,
  },
  analytics: {
    thresholds: {
      dauDropPercent: 30,
      errorRatePercent: 5,
      crashFreeUsersBelow: 99,
    },
  },
};
```

- [ ] **Step 2: typecheckパス確認**

Run: `cd issue-forge && npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add issue-forge/src/config.ts
git commit -m "feat: add application config with analytics thresholds"
```

---

### Task 3: GitHub重複チェック (dedup.ts)

**Files:**
- Create: `issue-forge/src/github/dedup.ts`
- Create: `issue-forge/tests/dedup.test.ts`

- [ ] **Step 1: テスト作成**

```ts
// tests/dedup.test.ts
import { describe, it, expect, vi } from "vitest";
import { findExistingIssue, buildDedupMarker, extractDedupKey } from "../src/github/dedup.js";

describe("buildDedupMarker", () => {
  it("creates HTML comment with source and key", () => {
    const marker = buildDedupMarker("crashlytics", "crash-123");
    expect(marker).toBe("<!-- issue-forge:crashlytics:crash-123 -->");
  });
});

describe("extractDedupKey", () => {
  it("extracts key from body with marker", () => {
    const body = "Some text\n<!-- issue-forge:crashlytics:crash-123 -->\nMore text";
    expect(extractDedupKey(body, "crashlytics")).toBe("crash-123");
  });

  it("returns null when no marker found", () => {
    expect(extractDedupKey("no marker here", "crashlytics")).toBeNull();
  });
});

describe("findExistingIssue", () => {
  it("returns issue number when match found", async () => {
    const mockOctokit = {
      rest: {
        search: {
          issuesAndPullRequests: vi.fn().mockResolvedValue({
            data: {
              total_count: 1,
              items: [{ number: 42, body: "<!-- issue-forge:crashlytics:crash-123 -->" }],
            },
          }),
        },
      },
    };
    const result = await findExistingIssue(
      mockOctokit as any,
      "hakaru",
      "1Take",
      "crashlytics",
      "crash-123"
    );
    expect(result).toBe(42);
  });

  it("returns null when no match found", async () => {
    const mockOctokit = {
      rest: {
        search: {
          issuesAndPullRequests: vi.fn().mockResolvedValue({
            data: { total_count: 0, items: [] },
          }),
        },
      },
    };
    const result = await findExistingIssue(
      mockOctokit as any,
      "hakaru",
      "1Take",
      "crashlytics",
      "crash-123"
    );
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: テスト実行して失敗確認**

Run: `cd issue-forge && npx vitest run tests/dedup.test.ts`
Expected: FAIL

- [ ] **Step 3: dedup.ts実装**

```ts
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
```

- [ ] **Step 4: テスト実行してパス確認**

Run: `cd issue-forge && npx vitest run tests/dedup.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add issue-forge/src/github/dedup.ts issue-forge/tests/dedup.test.ts
git commit -m "feat: add dedup module with marker-based issue deduplication"
```

---

### Task 4: GitHub Issue作成 (issue-creator.ts)

**Files:**
- Create: `issue-forge/src/github/issue-creator.ts`
- Create: `issue-forge/tests/issue-creator.test.ts`

- [ ] **Step 1: テスト作成**

```ts
// tests/issue-creator.test.ts
import { describe, it, expect, vi } from "vitest";
import { processCandidate } from "../src/github/issue-creator.js";
import type { IssueCandidate } from "../src/types.js";

function createMockOctokit(searchResults: any[] = []) {
  return {
    rest: {
      search: {
        issuesAndPullRequests: vi.fn().mockResolvedValue({
          data: { total_count: searchResults.length, items: searchResults },
        }),
      },
      issues: {
        create: vi.fn().mockResolvedValue({ data: { number: 99 } }),
        createComment: vi.fn().mockResolvedValue({ data: {} }),
      },
    },
  };
}

describe("processCandidate", () => {
  const owner = "hakaru";
  const repo = "1Take";

  it("creates new issue for merge strategy when no existing issue", async () => {
    const octokit = createMockOctokit([]);
    const candidate: IssueCandidate = {
      sourceType: "crashlytics",
      title: "[Crashlytics] EXC_BAD_ACCESS",
      body: "Stack trace...",
      labels: ["issue-forge", "issue-forge:crashlytics"],
      dedup: { strategy: "merge", key: "crash-123" },
    };

    const result = await processCandidate(octokit as any, owner, repo, candidate);
    expect(result).toBe("created");
    expect(octokit.rest.issues.create).toHaveBeenCalledOnce();
  });

  it("adds comment for merge strategy when existing issue found", async () => {
    const octokit = createMockOctokit([
      { number: 42, body: "<!-- issue-forge:crashlytics:crash-123 -->" },
    ]);
    const candidate: IssueCandidate = {
      sourceType: "crashlytics",
      title: "[Crashlytics] EXC_BAD_ACCESS",
      body: "Updated stack trace...",
      labels: ["issue-forge", "issue-forge:crashlytics"],
      dedup: { strategy: "merge", key: "crash-123" },
    };

    const result = await processCandidate(octokit as any, owner, repo, candidate);
    expect(result).toBe("updated");
    expect(octokit.rest.issues.createComment).toHaveBeenCalledOnce();
  });

  it("skips for create-once strategy when existing issue found", async () => {
    const octokit = createMockOctokit([
      { number: 42, body: "<!-- issue-forge:review:rev-456 -->" },
    ]);
    const candidate: IssueCandidate = {
      sourceType: "review",
      title: "[Review] ★2",
      body: "Review text",
      labels: ["issue-forge", "issue-forge:review"],
      dedup: { strategy: "create-once", key: "rev-456" },
    };

    const result = await processCandidate(octokit as any, owner, repo, candidate);
    expect(result).toBe("skipped");
    expect(octokit.rest.issues.create).not.toHaveBeenCalled();
  });

  it("always creates for always-new strategy without searching", async () => {
    const octokit = createMockOctokit([]);
    const candidate: IssueCandidate = {
      sourceType: "analytics",
      title: "[Analytics] DAU急落",
      body: "DAU dropped 45%",
      labels: ["issue-forge", "issue-forge:analytics"],
      dedup: { strategy: "always-new" },
    };

    const result = await processCandidate(octokit as any, owner, repo, candidate);
    expect(result).toBe("created");
    expect(octokit.rest.search.issuesAndPullRequests).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テスト実行して失敗確認**

Run: `cd issue-forge && npx vitest run tests/issue-creator.test.ts`
Expected: FAIL

- [ ] **Step 3: issue-creator.ts実装**

```ts
// src/github/issue-creator.ts
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

  // merge or create-once: check for existing issue
  const existingIssueNumber = await findExistingIssue(
    octokit,
    owner,
    repo,
    candidate.sourceType,
    dedup.key
  );

  if (existingIssueNumber !== null) {
    if (dedup.strategy === "merge") {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: existingIssueNumber,
        body: `## Update\n\n${candidate.body}`,
      });
      return "updated";
    }
    // create-once: skip
    return "skipped";
  }

  // No existing issue: create new
  await createIssue(octokit, owner, repo, candidate);
  return "created";
}

async function createIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  candidate: IssueCandidate
): Promise<void> {
  const marker =
    candidate.dedup.strategy !== "always-new"
      ? `\n\n${buildDedupMarker(candidate.sourceType, candidate.dedup.key)}`
      : "";

  await octokit.rest.issues.create({
    owner,
    repo,
    title: candidate.title,
    body: `${candidate.body}${marker}`,
    labels: candidate.labels,
  });
}
```

- [ ] **Step 4: テスト実行してパス確認**

Run: `cd issue-forge && npx vitest run tests/issue-creator.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add issue-forge/src/github/issue-creator.ts issue-forge/tests/issue-creator.test.ts
git commit -m "feat: add issue creator with merge/create-once/always-new strategies"
```

---

### Task 5: App Store Connect JWT認証 (asc-auth.ts)

**Files:**
- Create: `issue-forge/src/sources/asc-auth.ts`
- Create: `issue-forge/tests/sources/asc-auth.test.ts`

- [ ] **Step 1: テスト作成**

```ts
// tests/sources/asc-auth.test.ts
import { describe, it, expect, vi } from "vitest";
import jwt from "jsonwebtoken";
import { generateAscToken } from "../../src/sources/asc-auth.js";

describe("generateAscToken", () => {
  it("generates a valid ES256 JWT with correct claims", () => {
    // Use a test EC private key (P-256)
    const testKey = `-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIBkg4LVWM9nuwNSk3yByxZpYRTBnVJJPOaHHkMTMJMELoAcGBSuB
BAAiA0IABH0AHz3VBJKTFbGYDjQBgXOrmyc9eJnJOFhAvt53KT1HOMgxyMJH
fKFcbEY/8FiJPEOXJkjixkdrWNjYh0eSRYk=
-----END EC PRIVATE KEY-----`;

    const token = generateAscToken("issuer-123", "key-456", testKey);

    const decoded = jwt.decode(token, { complete: true });
    expect(decoded?.header.alg).toBe("ES256");
    expect(decoded?.header.kid).toBe("key-456");
    expect(decoded?.header.typ).toBe("JWT");
    expect((decoded?.payload as any).iss).toBe("issuer-123");
    expect((decoded?.payload as any).aud).toBe("appstoreconnect-v1");
  });

  it("sets expiration to 20 minutes", () => {
    const testKey = `-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIBkg4LVWM9nuwNSk3yByxZpYRTBnVJJPOaHHkMTMJMELoAcGBSuB
BAAiA0IABH0AHz3VBJKTFbGYDjQBgXOrmyc9eJnJOFhAvt53KT1HOMgxyMJH
fKFcbEY/8FiJPEOXJkjixkdrWNjYh0eSRYk=
-----END EC PRIVATE KEY-----`;

    const token = generateAscToken("issuer-123", "key-456", testKey);
    const decoded = jwt.decode(token, { complete: true });
    const payload = decoded?.payload as any;
    expect(payload.exp - payload.iat).toBe(20 * 60);
  });
});
```

- [ ] **Step 2: テスト実行して失敗確認**

Run: `cd issue-forge && npx vitest run tests/sources/asc-auth.test.ts`
Expected: FAIL

- [ ] **Step 3: asc-auth.ts実装**

```ts
// src/sources/asc-auth.ts
import jwt from "jsonwebtoken";

export function generateAscToken(
  issuerId: string,
  keyId: string,
  privateKey: string
): string {
  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      iss: issuerId,
      iat: now,
      exp: now + 20 * 60,
      aud: "appstoreconnect-v1",
    },
    privateKey,
    {
      algorithm: "ES256",
      noTimestamp: true, // iat is already in payload, prevent jsonwebtoken from adding a duplicate
      header: {
        alg: "ES256",
        kid: keyId,
        typ: "JWT",
      },
    }
  );
}
```

- [ ] **Step 4: テスト実行してパス確認**

Run: `cd issue-forge && npx vitest run tests/sources/asc-auth.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add issue-forge/src/sources/asc-auth.ts issue-forge/tests/sources/asc-auth.test.ts
git commit -m "feat: add App Store Connect JWT authentication"
```

---

### Task 6: Firebase Crashlytics ソース (crashlytics.ts)

**Files:**
- Create: `issue-forge/src/sources/crashlytics.ts`
- Create: `issue-forge/tests/sources/crashlytics.test.ts`

- [ ] **Step 1: テスト作成**

```ts
// tests/sources/crashlytics.test.ts
import { describe, it, expect, vi } from "vitest";
import { CrashlyticsSource, formatCrashlyticsIssue } from "../../src/sources/crashlytics.js";
import type { IssueCandidate } from "../../src/types.js";

describe("formatCrashlyticsIssue", () => {
  it("formats a BigQuery crash row into IssueCandidate", () => {
    const row = {
      issue_id: "crash-abc123",
      issue_title: "EXC_BAD_ACCESS in AudioEngine.swift:142",
      event_count: 15,
      user_count: 8,
      first_seen: "2026-03-23T00:00:00Z",
      last_seen: "2026-03-23T06:00:00Z",
      sample_stack_trace: "0 AudioEngine.swift:142\n1 CoreAudio:88",
      os_version: "iOS 19.3",
      device_model: "iPhone 16",
    };

    const result: IssueCandidate = formatCrashlyticsIssue(row);

    expect(result.sourceType).toBe("crashlytics");
    expect(result.title).toBe("[Crashlytics] EXC_BAD_ACCESS in AudioEngine.swift:142");
    expect(result.labels).toContain("issue-forge");
    expect(result.labels).toContain("issue-forge:crashlytics");
    expect(result.dedup).toEqual({ strategy: "merge", key: "crash-abc123" });
    expect(result.body).toContain("影響ユーザー: 8");
    expect(result.body).toContain("発生回数: 15");
  });

  it("adds priority:critical label when user_count >= 10", () => {
    const row = {
      issue_id: "crash-xyz",
      issue_title: "Signal 11",
      event_count: 100,
      user_count: 50,
      first_seen: "2026-03-23T00:00:00Z",
      last_seen: "2026-03-23T06:00:00Z",
      sample_stack_trace: "trace",
      os_version: "iOS 19.3",
      device_model: "iPhone 16",
    };

    const result = formatCrashlyticsIssue(row);
    expect(result.labels).toContain("priority:critical");
  });
});
```

- [ ] **Step 2: テスト実行して失敗確認**

Run: `cd issue-forge && npx vitest run tests/sources/crashlytics.test.ts`
Expected: FAIL

- [ ] **Step 3: crashlytics.ts実装**

```ts
// src/sources/crashlytics.ts
import { BigQuery } from "@google-cloud/bigquery";
import type { IssueCandidate, Source } from "../types.js";
import { config } from "../config.js";

export interface CrashlyticsRow {
  issue_id: string;
  issue_title: string;
  event_count: number;
  user_count: number;
  first_seen: string;
  last_seen: string;
  sample_stack_trace: string;
  os_version: string;
  device_model: string;
}

export function formatCrashlyticsIssue(row: CrashlyticsRow): IssueCandidate {
  const labels = ["issue-forge", "issue-forge:crashlytics"];
  if (row.user_count >= 10) {
    labels.push("priority:critical");
  } else {
    labels.push("priority:normal");
  }

  const body = [
    `## クラッシュ情報`,
    ``,
    `- **影響ユーザー: ${row.user_count}**`,
    `- **発生回数: ${row.event_count}**`,
    `- **初回発生**: ${row.first_seen}`,
    `- **最終発生**: ${row.last_seen}`,
    `- **OS**: ${row.os_version}`,
    `- **デバイス**: ${row.device_model}`,
    ``,
    `## スタックトレース`,
    ``,
    "```",
    row.sample_stack_trace,
    "```",
  ].join("\n");

  return {
    sourceType: "crashlytics",
    title: `[Crashlytics] ${row.issue_title}`,
    body,
    labels,
    dedup: { strategy: "merge", key: row.issue_id },
  };
}

export class CrashlyticsSource implements Source {
  name = "Crashlytics";
  private bigquery: BigQuery;

  constructor(credentials: object) {
    this.bigquery = new BigQuery({ credentials });
  }

  async fetch(): Promise<IssueCandidate[]> {
    const { firebaseProjectId, bigqueryDataset } = config.app;
    const hoursAgo = config.schedule.intervalHours;

    const query = `
      SELECT
        issue_id,
        issue_title,
        COUNT(*) as event_count,
        COUNT(DISTINCT installation_uuid) as user_count,
        MIN(event_timestamp) as first_seen,
        MAX(event_timestamp) as last_seen,
        ARRAY_AGG(
          CONCAT(
            IFNULL(exceptions[SAFE_OFFSET(0)].type, ''),
            ': ',
            IFNULL(exceptions[SAFE_OFFSET(0)].subtitle, ''),
            '\\n',
            IFNULL(exceptions[SAFE_OFFSET(0)].stacktrace, '')
          ) LIMIT 1
        )[OFFSET(0)] as sample_stack_trace,
        ARRAY_AGG(platform_version LIMIT 1)[OFFSET(0)] as os_version,
        ARRAY_AGG(device.model LIMIT 1)[OFFSET(0)] as device_model
      FROM \`${firebaseProjectId}.${bigqueryDataset}.crashlytics\`
      WHERE event_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${hoursAgo} HOUR)
      GROUP BY issue_id, issue_title
      ORDER BY event_count DESC
      LIMIT 50
    `;

    const [rows] = await this.bigquery.query({ query });
    return (rows as CrashlyticsRow[]).map(formatCrashlyticsIssue);
  }
}
```

- [ ] **Step 4: テスト実行してパス確認**

Run: `cd issue-forge && npx vitest run tests/sources/crashlytics.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add issue-forge/src/sources/crashlytics.ts issue-forge/tests/sources/crashlytics.test.ts
git commit -m "feat: add Crashlytics source via BigQuery export"
```

---

### Task 7: Firebase Analytics ソース (analytics.ts)

**Files:**
- Create: `issue-forge/src/sources/analytics.ts`
- Create: `issue-forge/tests/sources/analytics.test.ts`

- [ ] **Step 1: テスト作成**

```ts
// tests/sources/analytics.test.ts
import { describe, it, expect } from "vitest";
import { detectAnomalies } from "../../src/sources/analytics.js";

describe("detectAnomalies", () => {
  it("detects DAU drop exceeding threshold", () => {
    const today = { dau: 700, errorRate: 2, crashFreeUsers: 99.5 };
    const yesterday = { dau: 1100, errorRate: 2, crashFreeUsers: 99.5 };
    const thresholds = { dauDropPercent: 30, errorRatePercent: 5, crashFreeUsersBelow: 99 };

    const anomalies = detectAnomalies(today, yesterday, thresholds);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].sourceType).toBe("analytics");
    expect(anomalies[0].title).toContain("DAU");
  });

  it("detects error rate exceeding threshold", () => {
    const today = { dau: 1000, errorRate: 7, crashFreeUsers: 99.5 };
    const yesterday = { dau: 1000, errorRate: 2, crashFreeUsers: 99.5 };
    const thresholds = { dauDropPercent: 30, errorRatePercent: 5, crashFreeUsersBelow: 99 };

    const anomalies = detectAnomalies(today, yesterday, thresholds);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].title).toContain("エラー率");
  });

  it("detects crash free rate below threshold", () => {
    const today = { dau: 1000, errorRate: 2, crashFreeUsers: 98.2 };
    const yesterday = { dau: 1000, errorRate: 2, crashFreeUsers: 99.5 };
    const thresholds = { dauDropPercent: 30, errorRatePercent: 5, crashFreeUsersBelow: 99 };

    const anomalies = detectAnomalies(today, yesterday, thresholds);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].title).toContain("クラッシュフリー率");
  });

  it("returns empty when all metrics normal", () => {
    const today = { dau: 1000, errorRate: 2, crashFreeUsers: 99.5 };
    const yesterday = { dau: 1050, errorRate: 2, crashFreeUsers: 99.5 };
    const thresholds = { dauDropPercent: 30, errorRatePercent: 5, crashFreeUsersBelow: 99 };

    const anomalies = detectAnomalies(today, yesterday, thresholds);
    expect(anomalies).toHaveLength(0);
  });

  it("uses create-once with metric+date key", () => {
    const today = { dau: 500, errorRate: 2, crashFreeUsers: 99.5 };
    const yesterday = { dau: 1000, errorRate: 2, crashFreeUsers: 99.5 };
    const thresholds = { dauDropPercent: 30, errorRatePercent: 5, crashFreeUsersBelow: 99 };

    const anomalies = detectAnomalies(today, yesterday, thresholds);
    expect(anomalies[0].dedup.strategy).toBe("create-once");
    expect((anomalies[0].dedup as any).key).toMatch(/^dau-drop-\d{4}-\d{2}-\d{2}$/);
  });

  it("detects multiple anomalies simultaneously", () => {
    const today = { dau: 500, errorRate: 7, crashFreeUsers: 98 };
    const yesterday = { dau: 1000, errorRate: 2, crashFreeUsers: 99.5 };
    const thresholds = { dauDropPercent: 30, errorRatePercent: 5, crashFreeUsersBelow: 99 };

    const anomalies = detectAnomalies(today, yesterday, thresholds);
    expect(anomalies).toHaveLength(3);
  });
});
```

- [ ] **Step 2: テスト実行して失敗確認**

Run: `cd issue-forge && npx vitest run tests/sources/analytics.test.ts`
Expected: FAIL

- [ ] **Step 3: analytics.ts実装**

```ts
// src/sources/analytics.ts
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import type { IssueCandidate, Source, AnalyticsThresholds } from "../types.js";
import { config } from "../config.js";

export interface DailyMetrics {
  dau: number;
  errorRate: number;
  crashFreeUsers: number;
}

export function detectAnomalies(
  today: DailyMetrics,
  yesterday: DailyMetrics,
  thresholds: AnalyticsThresholds
): IssueCandidate[] {
  const anomalies: IssueCandidate[] = [];
  const dateKey = new Date().toISOString().split("T")[0];

  // DAU drop check
  if (yesterday.dau > 0) {
    const dropPercent = ((yesterday.dau - today.dau) / yesterday.dau) * 100;
    if (dropPercent >= thresholds.dauDropPercent) {
      anomalies.push({
        sourceType: "analytics",
        title: `[Analytics] DAU急落: -${dropPercent.toFixed(0)}% (前日比)`,
        body: [
          `## DAU異常検出`,
          ``,
          `- **本日**: ${today.dau}`,
          `- **前日**: ${yesterday.dau}`,
          `- **変化率**: -${dropPercent.toFixed(1)}%`,
          `- **閾値**: -${thresholds.dauDropPercent}%`,
        ].join("\n"),
        labels: ["issue-forge", "issue-forge:analytics", "priority:critical"],
        dedup: { strategy: "create-once", key: `dau-drop-${dateKey}` },
      });
    }
  }

  // Error rate check
  if (today.errorRate > thresholds.errorRatePercent) {
    anomalies.push({
      sourceType: "analytics",
      title: `[Analytics] エラー率上昇: ${today.errorRate.toFixed(1)}%`,
      body: [
        `## エラー率異常検出`,
        ``,
        `- **現在のエラー率**: ${today.errorRate.toFixed(1)}%`,
        `- **閾値**: ${thresholds.errorRatePercent}%`,
      ].join("\n"),
      labels: ["issue-forge", "issue-forge:analytics", "priority:critical"],
      dedup: { strategy: "create-once", key: `error-rate-${dateKey}` },
    });
  }

  // Crash free users check
  if (today.crashFreeUsers < thresholds.crashFreeUsersBelow) {
    anomalies.push({
      sourceType: "analytics",
      title: `[Analytics] クラッシュフリー率低下: ${today.crashFreeUsers.toFixed(1)}%`,
      body: [
        `## クラッシュフリー率異常検出`,
        ``,
        `- **現在のクラッシュフリー率**: ${today.crashFreeUsers.toFixed(1)}%`,
        `- **閾値**: ${thresholds.crashFreeUsersBelow}%`,
      ].join("\n"),
      labels: ["issue-forge", "issue-forge:analytics", "priority:critical"],
      dedup: { strategy: "create-once", key: `crash-free-${dateKey}` },
    });
  }

  return anomalies;
}

export class AnalyticsSource implements Source {
  name = "Analytics";
  private client: BetaAnalyticsDataClient;

  constructor(credentials: object) {
    this.client = new BetaAnalyticsDataClient({ credentials });
  }

  async fetch(): Promise<IssueCandidate[]> {
    const propertyId = config.app.ga4PropertyId;

    const [todayReport] = await this.client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: "today", endDate: "today" }],
      metrics: [
        { name: "activeUsers" },
        { name: "crashFreeUsersRate" },
      ],
      dimensions: [{ name: "eventName" }],
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          stringFilter: { matchType: "EXACT", value: "app_exception" },
        },
      },
    });

    const [todayTotalReport] = await this.client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: "today", endDate: "today" }],
      metrics: [{ name: "activeUsers" }, { name: "eventCount" }],
    });

    const [yesterdayTotalReport] = await this.client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }],
      metrics: [{ name: "activeUsers" }, { name: "eventCount" }],
    });

    const today = parseMetrics(todayReport, todayTotalReport);
    const yesterday = parseMetrics(null, yesterdayTotalReport);

    return detectAnomalies(today, yesterday, config.analytics.thresholds);
  }
}

function parseMetrics(errorReport: any, totalReport: any): DailyMetrics {
  const totalRow = totalReport?.rows?.[0];
  const errorRow = errorReport?.rows?.[0];

  const totalEvents = Number(totalRow?.metricValues?.[1]?.value ?? 0);
  const errorEvents = Number(errorRow?.metricValues?.[0]?.value ?? 0);
  const dau = Number(totalRow?.metricValues?.[0]?.value ?? 0);
  const crashFreeRate = totalRow?.metricValues?.[2]?.value
    ? Number(totalRow.metricValues[2].value) * 100
    : 100;

  return {
    dau,
    errorRate: totalEvents > 0 ? (errorEvents / totalEvents) * 100 : 0,
    crashFreeUsers: crashFreeRate,
  };
}
```

- [ ] **Step 4: テスト実行してパス確認**

Run: `cd issue-forge && npx vitest run tests/sources/analytics.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add issue-forge/src/sources/analytics.ts issue-forge/tests/sources/analytics.test.ts
git commit -m "feat: add Analytics source with threshold-based anomaly detection"
```

---

### Task 8: App Store Connect レビューソース (appstore-reviews.ts)

**Files:**
- Create: `issue-forge/src/sources/appstore-reviews.ts`
- Create: `issue-forge/tests/sources/appstore-reviews.test.ts`

- [ ] **Step 1: テスト作成**

```ts
// tests/sources/appstore-reviews.test.ts
import { describe, it, expect } from "vitest";
import { formatReviewIssue } from "../../src/sources/appstore-reviews.js";

describe("formatReviewIssue", () => {
  it("formats a review into IssueCandidate", () => {
    const review = {
      id: "rev-123",
      attributes: {
        rating: 2,
        title: "録音が途中で止まる",
        body: "3分以上録音すると必ず止まります",
        reviewerNickname: "音楽好き",
        createdDate: "2026-03-23T10:00:00Z",
      },
      relationships: {
        response: { data: null },
      },
    };
    const appVersion = "2.1.0";

    const result = formatReviewIssue(review, appVersion);

    expect(result.sourceType).toBe("review");
    expect(result.title).toBe("[Review] ★2 「録音が途中で止まる」");
    expect(result.body).toContain("音楽好き");
    expect(result.body).toContain("v2.1.0");
    expect(result.labels).toContain("star:2");
    expect(result.labels).toContain("issue-forge:review");
    expect(result.dedup).toEqual({ strategy: "create-once", key: "rev-123" });
  });

  it("generates star label matching rating", () => {
    const review = {
      id: "rev-456",
      attributes: {
        rating: 5,
        title: "最高！",
        body: "素晴らしいアプリです",
        reviewerNickname: "user",
        createdDate: "2026-03-23T10:00:00Z",
      },
      relationships: { response: { data: null } },
    };

    const result = formatReviewIssue(review, "1.0");
    expect(result.labels).toContain("star:5");
    expect(result.labels).not.toContain("priority:critical");
  });

  it("adds priority:critical for 1-star reviews", () => {
    const review = {
      id: "rev-789",
      attributes: {
        rating: 1,
        title: "ひどい",
        body: "動かない",
        reviewerNickname: "user",
        createdDate: "2026-03-23T10:00:00Z",
      },
      relationships: { response: { data: null } },
    };

    const result = formatReviewIssue(review, "1.0");
    expect(result.labels).toContain("priority:critical");
  });
});
```

- [ ] **Step 2: テスト実行して失敗確認**

Run: `cd issue-forge && npx vitest run tests/sources/appstore-reviews.test.ts`
Expected: FAIL

- [ ] **Step 3: appstore-reviews.ts実装**

```ts
// src/sources/appstore-reviews.ts
import type { IssueCandidate, Source } from "../types.js";
import { config } from "../config.js";
import { generateAscToken } from "./asc-auth.js";

interface AscReview {
  id: string;
  attributes: {
    rating: number;
    title: string;
    body: string;
    reviewerNickname: string;
    createdDate: string;
  };
  relationships: {
    response: { data: any };
  };
}

export function formatReviewIssue(review: AscReview, appVersion: string): IssueCandidate {
  const { rating, title, body, reviewerNickname, createdDate } = review.attributes;
  const stars = "★".repeat(rating) + "☆".repeat(5 - rating);

  const labels = ["issue-forge", "issue-forge:review", `star:${rating}`];
  if (rating <= 2) {
    labels.push("priority:critical");
  } else {
    labels.push("priority:normal");
  }

  const issueBody = [
    `## レビュー`,
    ``,
    `| 項目 | 値 |`,
    `|---|---|`,
    `| **評価** | ${stars} (${rating}/5) |`,
    `| **レビュワー** | ${reviewerNickname} |`,
    `| **バージョン** | v${appVersion} |`,
    `| **日時** | ${createdDate} |`,
    ``,
    `### タイトル`,
    title,
    ``,
    `### 本文`,
    body,
  ].join("\n");

  return {
    sourceType: "review",
    title: `[Review] ★${rating} 「${title}」`,
    body: issueBody,
    labels,
    dedup: { strategy: "create-once", key: review.id },
  };
}

export class AppStoreReviewsSource implements Source {
  name = "Reviews";
  private issuerId: string;
  private keyId: string;
  private privateKey: string;

  constructor(issuerId: string, keyId: string, privateKey: string) {
    this.issuerId = issuerId;
    this.keyId = keyId;
    this.privateKey = privateKey;
  }

  async fetch(): Promise<IssueCandidate[]> {
    const token = generateAscToken(this.issuerId, this.keyId, this.privateKey);
    const appId = config.app.appStoreAppId;
    const hoursAgo = config.schedule.intervalHours;
    const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

    const url = `https://api.appstoreconnect.apple.com/v1/apps/${appId}/customerReviews?sort=-createdDate&limit=50`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`App Store Connect API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const reviews: AscReview[] = (data.data ?? []).filter(
      (r: AscReview) => new Date(r.attributes.createdDate) >= new Date(since)
    );

    // Get current app version for context
    const appVersion = await this.getCurrentVersion(token, appId);

    return reviews.map((r) => formatReviewIssue(r, appVersion));
  }

  private async getCurrentVersion(token: string, appId: string): Promise<string> {
    try {
      const url = `https://api.appstoreconnect.apple.com/v1/apps/${appId}/appStoreVersions?filter[appStoreState]=READY_FOR_DISTRIBUTION&limit=1`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      return data.data?.[0]?.attributes?.versionString ?? "unknown";
    } catch {
      return "unknown";
    }
  }
}
```

- [ ] **Step 4: テスト実行してパス確認**

Run: `cd issue-forge && npx vitest run tests/sources/appstore-reviews.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add issue-forge/src/sources/appstore-reviews.ts issue-forge/tests/sources/appstore-reviews.test.ts
git commit -m "feat: add App Store reviews source"
```

---

### Task 9: App Store Connect クラッシュソース (appstore-crashes.ts)

**Files:**
- Create: `issue-forge/src/sources/appstore-crashes.ts`
- Create: `issue-forge/tests/sources/appstore-crashes.test.ts`

- [ ] **Step 1: テスト作成**

```ts
// tests/sources/appstore-crashes.test.ts
import { describe, it, expect } from "vitest";
import { formatCrashIssue } from "../../src/sources/appstore-crashes.js";

describe("formatCrashIssue", () => {
  it("formats a diagnostic signature into IssueCandidate", () => {
    const sig = {
      id: "sig-abc",
      attributes: {
        diagnosticType: "CRASH",
        signature: "Signal 11 in CoreAudio",
        weight: 42.5,
      },
    };

    const result = formatCrashIssue(sig);

    expect(result.sourceType).toBe("appstore-crash");
    expect(result.title).toBe("[AppStore Crash] Signal 11 in CoreAudio");
    expect(result.labels).toContain("issue-forge:appstore-crash");
    expect(result.dedup).toEqual({ strategy: "merge", key: "sig-abc" });
    expect(result.body).toContain("42.5");
  });

  it("adds priority:critical for high weight crashes", () => {
    const sig = {
      id: "sig-xyz",
      attributes: {
        diagnosticType: "CRASH",
        signature: "EXC_BAD_ACCESS",
        weight: 60,
      },
    };

    const result = formatCrashIssue(sig);
    expect(result.labels).toContain("priority:critical");
  });
});
```

- [ ] **Step 2: テスト実行して失敗確認**

Run: `cd issue-forge && npx vitest run tests/sources/appstore-crashes.test.ts`
Expected: FAIL

- [ ] **Step 3: appstore-crashes.ts実装**

```ts
// src/sources/appstore-crashes.ts
import * as core from "@actions/core";
import type { IssueCandidate, Source } from "../types.js";
import { config } from "../config.js";
import { generateAscToken } from "./asc-auth.js";

interface DiagnosticSignature {
  id: string;
  attributes: {
    diagnosticType: string;
    signature: string;
    weight: number;
  };
}

export function formatCrashIssue(sig: DiagnosticSignature): IssueCandidate {
  const labels = ["issue-forge", "issue-forge:appstore-crash"];
  if (sig.attributes.weight >= 50) {
    labels.push("priority:critical");
  } else {
    labels.push("priority:normal");
  }

  const body = [
    `## App Store クラッシュ`,
    ``,
    `- **シグネチャ**: ${sig.attributes.signature}`,
    `- **タイプ**: ${sig.attributes.diagnosticType}`,
    `- **影響度 (weight)**: ${sig.attributes.weight}%`,
  ].join("\n");

  return {
    sourceType: "appstore-crash",
    title: `[AppStore Crash] ${sig.attributes.signature}`,
    body,
    labels,
    dedup: { strategy: "merge", key: sig.id },
  };
}

export class AppStoreCrashesSource implements Source {
  name = "AppStore Crashes";
  private issuerId: string;
  private keyId: string;
  private privateKey: string;

  constructor(issuerId: string, keyId: string, privateKey: string) {
    this.issuerId = issuerId;
    this.keyId = keyId;
    this.privateKey = privateKey;
  }

  async fetch(): Promise<IssueCandidate[]> {
    const token = generateAscToken(this.issuerId, this.keyId, this.privateKey);
    const appId = config.app.appStoreAppId;

    const url = `https://api.appstoreconnect.apple.com/v1/apps/${appId}/diagnosticSignatures?filter[diagnosticType]=CRASHES&limit=50`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      if (response.status === 404) {
        core.warning("AppStore Crashes: diagnostic data not available (app may not have enough users)");
        return [];
      }
      throw new Error(`App Store Connect API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const signatures: DiagnosticSignature[] = data.data ?? [];

    return signatures.map(formatCrashIssue);
  }
}
```

- [ ] **Step 4: テスト実行してパス確認**

Run: `cd issue-forge && npx vitest run tests/sources/appstore-crashes.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add issue-forge/src/sources/appstore-crashes.ts issue-forge/tests/sources/appstore-crashes.test.ts
git commit -m "feat: add App Store crashes source via diagnosticSignatures API"
```

---

### Task 10: App Store Connect 審査結果ソース (appstore-submission.ts)

**Files:**
- Create: `issue-forge/src/sources/appstore-submission.ts`
- Create: `issue-forge/tests/sources/appstore-submission.test.ts`

- [ ] **Step 1: テスト作成**

```ts
// tests/sources/appstore-submission.test.ts
import { describe, it, expect } from "vitest";
import { formatSubmissionIssue, isRelevantStatusChange } from "../../src/sources/appstore-submission.js";

describe("formatSubmissionIssue", () => {
  it("formats a rejected version into IssueCandidate", () => {
    const version = {
      id: "ver-123",
      attributes: {
        versionString: "2.1.0",
        appStoreState: "REJECTED",
        createdDate: "2026-03-23T08:00:00Z",
      },
    };

    const result = formatSubmissionIssue(version);

    expect(result.sourceType).toBe("submission");
    expect(result.title).toBe("[Submission] v2.1.0 Rejected");
    expect(result.labels).toContain("status:rejected");
    expect(result.labels).toContain("priority:critical");
    expect(result.dedup).toEqual({ strategy: "create-once", key: "2.1.0-REJECTED" });
  });

  it("formats an approved version into IssueCandidate", () => {
    const version = {
      id: "ver-456",
      attributes: {
        versionString: "2.1.0",
        appStoreState: "READY_FOR_DISTRIBUTION",
        createdDate: "2026-03-23T08:00:00Z",
      },
    };

    const result = formatSubmissionIssue(version);

    expect(result.title).toBe("[Submission] v2.1.0 Approved");
    expect(result.labels).toContain("status:approved");
    expect(result.labels).not.toContain("priority:critical");
  });
});

describe("isRelevantStatusChange", () => {
  it("returns true for REJECTED", () => {
    expect(isRelevantStatusChange("REJECTED")).toBe(true);
  });

  it("returns true for READY_FOR_DISTRIBUTION", () => {
    expect(isRelevantStatusChange("READY_FOR_DISTRIBUTION")).toBe(true);
  });

  it("returns false for IN_REVIEW", () => {
    expect(isRelevantStatusChange("IN_REVIEW")).toBe(false);
  });

  it("returns false for WAITING_FOR_REVIEW", () => {
    expect(isRelevantStatusChange("WAITING_FOR_REVIEW")).toBe(false);
  });
});
```

- [ ] **Step 2: テスト実行して失敗確認**

Run: `cd issue-forge && npx vitest run tests/sources/appstore-submission.test.ts`
Expected: FAIL

- [ ] **Step 3: appstore-submission.ts実装**

```ts
// src/sources/appstore-submission.ts
import type { IssueCandidate, Source } from "../types.js";
import { config } from "../config.js";
import { generateAscToken } from "./asc-auth.js";

interface AppStoreVersion {
  id: string;
  attributes: {
    versionString: string;
    appStoreState: string;
    createdDate: string;
  };
}

const RELEVANT_STATES = new Set([
  "REJECTED",
  "READY_FOR_DISTRIBUTION",
  "DEVELOPER_REJECTED",
  "REMOVED_FROM_SALE",
]);

export function isRelevantStatusChange(state: string): boolean {
  return RELEVANT_STATES.has(state);
}

export function formatSubmissionIssue(version: AppStoreVersion): IssueCandidate {
  const { versionString, appStoreState, createdDate } = version.attributes;
  const isRejected = appStoreState === "REJECTED" || appStoreState === "DEVELOPER_REJECTED";
  const isApproved = appStoreState === "READY_FOR_DISTRIBUTION";

  const statusLabel = isRejected ? "status:rejected" : isApproved ? "status:approved" : "";
  const displayStatus = isRejected ? "Rejected" : isApproved ? "Approved" : appStoreState;

  const labels = ["issue-forge", "issue-forge:submission"];
  if (statusLabel) labels.push(statusLabel);
  if (isRejected) {
    labels.push("priority:critical");
  } else {
    labels.push("priority:normal");
  }

  const body = [
    `## 審査結果`,
    ``,
    `- **バージョン**: v${versionString}`,
    `- **ステータス**: ${appStoreState}`,
    `- **日時**: ${createdDate}`,
    ``,
    isRejected
      ? `> ⚠️ Resolution Centerの詳細メッセージはAPIでは取得できません。[App Store Connect](https://appstoreconnect.apple.com) で詳細を確認してください。`
      : "",
  ].join("\n");

  return {
    sourceType: "submission",
    title: `[Submission] v${versionString} ${displayStatus}`,
    body,
    labels,
    dedup: { strategy: "create-once", key: `${versionString}-${appStoreState}` },
  };
}

export class AppStoreSubmissionSource implements Source {
  name = "Submission";
  private issuerId: string;
  private keyId: string;
  private privateKey: string;

  constructor(issuerId: string, keyId: string, privateKey: string) {
    this.issuerId = issuerId;
    this.keyId = keyId;
    this.privateKey = privateKey;
  }

  async fetch(): Promise<IssueCandidate[]> {
    const token = generateAscToken(this.issuerId, this.keyId, this.privateKey);
    const appId = config.app.appStoreAppId;

    const url = `https://api.appstoreconnect.apple.com/v1/apps/${appId}/appStoreVersions?limit=5&sort=-createdDate`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`App Store Connect API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const versions: AppStoreVersion[] = (data.data ?? []).filter((v: AppStoreVersion) =>
      isRelevantStatusChange(v.attributes.appStoreState)
    );

    return versions.map(formatSubmissionIssue);
  }
}
```

- [ ] **Step 4: テスト実行してパス確認**

Run: `cd issue-forge && npx vitest run tests/sources/appstore-submission.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add issue-forge/src/sources/appstore-submission.ts issue-forge/tests/sources/appstore-submission.test.ts
git commit -m "feat: add App Store submission/review status source"
```

---

### Task 11: エントリポイント (index.ts)

**Files:**
- Create: `issue-forge/src/index.ts`
- Create: `issue-forge/tests/index.test.ts`

- [ ] **Step 1: テスト作成**

```ts
// tests/index.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
  setFailed: vi.fn(),
}));

import { filterSources, runSources } from "../src/index.js";
import type { Source, IssueCandidate, SourceResult } from "../src/types.js";

function mockSource(name: string, candidates: IssueCandidate[]): Source {
  return { name, fetch: vi.fn().mockResolvedValue(candidates) };
}

function failingSource(name: string, error: string): Source {
  return { name, fetch: vi.fn().mockRejectedValue(new Error(error)) };
}

describe("filterSources", () => {
  const sources = [
    mockSource("Crashlytics", []),
    mockSource("Analytics", []),
    mockSource("Reviews", []),
  ];

  it("returns all sources for 'all'", () => {
    expect(filterSources(sources, "all")).toHaveLength(3);
  });

  it("filters to matching source name", () => {
    const filtered = filterSources(sources, "crashlytics");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("Crashlytics");
  });

  it("returns all sources with warning for unknown filter", () => {
    const filtered = filterSources(sources, "unknown");
    expect(filtered).toHaveLength(3);
  });
});

describe("runSources", () => {
  it("collects results from all sources", async () => {
    const sources = [
      mockSource("Crashlytics", []),
      mockSource("Analytics", []),
    ];
    const processCandidate = vi.fn().mockResolvedValue("created");

    const results = await runSources(sources, processCandidate);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it("continues when one source fails", async () => {
    const sources = [
      failingSource("Crashlytics", "BigQuery error"),
      mockSource("Analytics", []),
    ];
    const processCandidate = vi.fn().mockResolvedValue("created");

    const results = await runSources(sources, processCandidate);
    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe("BigQuery error");
    expect(results[1].success).toBe(true);
  });

  it("reports all failed when every source fails", async () => {
    const sources = [
      failingSource("Crashlytics", "error1"),
      failingSource("Analytics", "error2"),
    ];
    const processCandidate = vi.fn().mockResolvedValue("created");

    const results = await runSources(sources, processCandidate);
    expect(results.every((r) => !r.success)).toBe(true);
  });
});
```

- [ ] **Step 2: テスト実行して失敗確認**

Run: `cd issue-forge && npx vitest run tests/index.test.ts`
Expected: FAIL

- [ ] **Step 3: index.ts実装**

```ts
// src/index.ts
import * as core from "@actions/core";
import { Octokit } from "@octokit/rest";
import type { Source, IssueCandidate, SourceResult } from "./types.js";
import { config } from "./config.js";
import { processCandidate as processCandidateImpl } from "./github/issue-creator.js";
import { CrashlyticsSource } from "./sources/crashlytics.js";
import { AnalyticsSource } from "./sources/analytics.js";
import { AppStoreReviewsSource } from "./sources/appstore-reviews.js";
import { AppStoreCrashesSource } from "./sources/appstore-crashes.js";
import { AppStoreSubmissionSource } from "./sources/appstore-submission.js";

type ProcessFn = (candidate: IssueCandidate) => Promise<"created" | "updated" | "skipped">;

export function filterSources(sources: Source[], filter: string): Source[] {
  if (filter === "all" || !filter) return sources;

  const nameMap: Record<string, string> = {
    crashlytics: "Crashlytics",
    analytics: "Analytics",
    "appstore-reviews": "Reviews",
    "appstore-crashes": "AppStore Crashes",
    submission: "Submission",
  };

  const targetName = nameMap[filter];
  if (!targetName) {
    core.warning(`Unknown source filter: "${filter}". Running all sources.`);
    return sources;
  }

  return sources.filter((s) => s.name === targetName);
}

export async function runSources(
  sources: Source[],
  processCandidate: ProcessFn
): Promise<SourceResult[]> {
  const results: SourceResult[] = [];

  for (const source of sources) {
    try {
      const candidates = await source.fetch();
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const candidate of candidates) {
        const result = await processCandidate(candidate);
        if (result === "created") created++;
        else if (result === "updated") updated++;
        else skipped++;
      }

      const msg = `✓ ${source.name}: ${candidates.length}件取得 → ${created} Issue作成, ${updated} Issue更新, ${skipped} スキップ`;
      core.info(msg);
      results.push({
        sourceName: source.name,
        success: true,
        issuesCreated: created,
        issuesUpdated: updated,
        issuesSkipped: skipped,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      core.warning(`✗ ${source.name}: ${errorMsg}`);
      results.push({
        sourceName: source.name,
        success: false,
        issuesCreated: 0,
        issuesUpdated: 0,
        issuesSkipped: 0,
        error: errorMsg,
      });
    }
  }

  return results;
}

async function main() {
  const owner = "hakaru";
  const repo = "1Take";
  const sourceFilter = process.env.SOURCE_FILTER || "all";

  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  // Parse Firebase credentials
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT secret is not set");
  }
  const firebaseSa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, "base64").toString()
  );

  const ascIssuerId = process.env.ASC_ISSUER_ID || "";
  const ascKeyId = process.env.ASC_KEY_ID || "";
  const ascPrivateKey = process.env.ASC_PRIVATE_KEY || "";

  const allSources: Source[] = [
    new CrashlyticsSource(firebaseSa),
    new AnalyticsSource(firebaseSa),
    new AppStoreReviewsSource(ascIssuerId, ascKeyId, ascPrivateKey),
    new AppStoreCrashesSource(ascIssuerId, ascKeyId, ascPrivateKey),
    new AppStoreSubmissionSource(ascIssuerId, ascKeyId, ascPrivateKey),
  ];

  const sources = filterSources(allSources, sourceFilter);
  core.info(`IssueForge: ${sources.length}ソース実行 (filter: ${sourceFilter})`);

  const processFn: ProcessFn = (candidate) =>
    processCandidateImpl(octokit, owner, repo, candidate);

  const results = await runSources(sources, processFn);

  const allFailed = results.every((r) => !r.success);
  if (allFailed && results.length > 0) {
    core.setFailed("All sources failed.");
  }
}

main().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
```

- [ ] **Step 4: テスト実行してパス確認**

Run: `cd issue-forge && npx vitest run tests/index.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add issue-forge/src/index.ts issue-forge/tests/index.test.ts
git commit -m "feat: add entry point with source filtering and orchestration"
```

---

### Task 12: GitHub Actions ワークフロー

**Files:**
- Create: `.github/workflows/issue-forge.yml`

- [ ] **Step 1: ワークフローファイル作成**

```yaml
# .github/workflows/issue-forge.yml
name: IssueForge
on:
  schedule:
    - cron: '0 0,12 * * *'
  workflow_dispatch:
    inputs:
      source:
        description: '実行するソース'
        required: false
        type: choice
        options:
          - all
          - crashlytics
          - analytics
          - appstore-reviews
          - appstore-crashes
          - submission

jobs:
  run:
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: 'issue-forge/package-lock.json'
      - name: Install dependencies
        run: cd issue-forge && npm ci
      - name: Run IssueForge
        run: cd issue-forge && npm run start
        env:
          FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          ASC_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
          ASC_KEY_ID: ${{ secrets.ASC_KEY_ID }}
          ASC_PRIVATE_KEY: ${{ secrets.ASC_PRIVATE_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SOURCE_FILTER: ${{ inputs.source || 'all' }}
```

- [ ] **Step 2: コミット**

```bash
git add .github/workflows/issue-forge.yml
git commit -m "feat: add GitHub Actions workflow for IssueForge cron + manual trigger"
```

---

### Task 13: 全テスト実行 + typecheck

- [ ] **Step 1: 全テスト実行**

Run: `cd issue-forge && npx vitest run`
Expected: 全テストPASS

- [ ] **Step 2: typecheck実行**

Run: `cd issue-forge && npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 3: 問題があれば修正してコミット**

```bash
git add issue-forge/
git commit -m "fix: resolve any remaining type/test issues"
```

---

### Task 14: README + 最終コミット

- [ ] **Step 1: README作成**

Create `issue-forge/README.md` with:
- プロジェクト概要
- セットアップ手順（GitHub Secrets設定）
- Firebase BigQuery Exportの有効化手順
- App Store Connect APIキーの取得手順
- 手動実行方法
- 設定変更方法（config.ts）

- [ ] **Step 2: コミット**

```bash
git add issue-forge/README.md
git commit -m "docs: add IssueForge README with setup instructions"
```
