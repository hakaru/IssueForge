# IssueForge v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform IssueForge from a single-repo tool into a reusable JavaScript GitHub Action that anyone can use to automatically create GitHub Issues from App Store Connect feedback.

**Architecture:** JavaScript Action (`action.yml` + `dist/index.js`). Users add a workflow calling `uses: hakaru/IssueForge@v1` with their ASC credentials. The action reads inputs, fetches ASC data, dedup-checks, and creates Issues. Built with `@vercel/ncc` for single-file distribution.

**Tech Stack:** TypeScript, Node.js 20, `@actions/core`, `@actions/github`, `@octokit/rest`, `jsonwebtoken`, `@vercel/ncc`, Vitest

---

## File Structure

```
hakaru/IssueForge/
├── action.yml                      # JavaScript Action definition
├── dist/
│   └── index.js                    # ncc-bundled entry (committed)
├── src/
│   ├── index.ts                    # NEW: inputs parsing → source execution → outputs
│   ├── types.ts                    # MODIFIED: remove Firebase types, add ActionInputs
│   ├── inputs.ts                   # NEW: parse + validate Action inputs
│   ├── sources/
│   │   ├── asc-auth.ts             # KEEP from v1 (ASC JWT generation)
│   │   ├── appstore-reviews.ts     # MODIFY from v1 (accept params instead of config)
│   │   ├── appstore-crashes.ts     # MODIFY from v1 (accept params instead of config)
│   │   └── appstore-submission.ts  # MODIFY from v1 (accept params instead of config)
│   └── github/
│       ├── issue-creator.ts        # KEEP from v1
│       ├── dedup.ts                # KEEP from v1
│       └── labels.ts               # NEW: ensure labels exist
├── tests/
│   ├── inputs.test.ts
│   ├── index.test.ts
│   ├── labels.test.ts
│   ├── sources/
│   │   ├── asc-auth.test.ts        # KEEP from v1
│   │   ├── appstore-reviews.test.ts
│   │   ├── appstore-crashes.test.ts
│   │   └── appstore-submission.test.ts
│   ├── dedup.test.ts               # KEEP from v1
│   └── issue-creator.test.ts       # KEEP from v1
├── .github/
│   └── workflows/
│       └── release.yml             # Release automation
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── LICENSE
```

Note: v1 files `config.ts`, `sources/crashlytics.ts`, `sources/analytics.ts` are **deleted** (Firebase removed from scope).

---

### Task 1: プロジェクトリセット — v1コードをコピーしてクリーンアップ

**Files:**
- Copy from v1: `src/sources/asc-auth.ts`, `src/sources/appstore-reviews.ts`, `src/sources/appstore-crashes.ts`, `src/sources/appstore-submission.ts`, `src/github/dedup.ts`, `src/github/issue-creator.ts`
- Copy from v1: all corresponding test files
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `action.yml`
- Create: `LICENSE`
- Do NOT copy: `config.ts`, `sources/crashlytics.ts`, `sources/analytics.ts`, `src/index.ts` (will be rewritten)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "issue-forge",
  "version": "2.0.0",
  "private": true,
  "scripts": {
    "build": "ncc build src/index.ts -o dist --minify",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@actions/core": "^1.10.1",
    "@actions/github": "^6.0.0",
    "@octokit/rest": "^20.0.2",
    "jsonwebtoken": "^9.0.2"
  },
  "devDependencies": {
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^20.11.0",
    "@vercel/ncc": "^0.38.1",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src", "tests"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
```

- [ ] **Step 4: Create action.yml**

```yaml
name: 'IssueForge'
description: 'Automatically create GitHub Issues from App Store Connect feedback'
author: 'hakaru'
branding:
  icon: 'alert-circle'
  color: 'blue'

inputs:
  app-store-app-id:
    description: 'App Store Connect Apple ID (numeric)'
    required: true
  asc-issuer-id:
    description: 'App Store Connect API Issuer ID'
    required: true
  asc-key-id:
    description: 'App Store Connect API Key ID'
    required: true
  asc-private-key:
    description: 'App Store Connect API Private Key (.p8 content)'
    required: true
  sources:
    description: 'Comma-separated list of sources to enable (reviews,crashes,submission)'
    required: false
    default: 'reviews,crashes,submission'
  github-token:
    description: 'GitHub token for creating issues'
    required: false
    default: ${{ github.token }}
  interval-hours:
    description: 'Time window in hours to fetch data for'
    required: false
    default: '12'
  labels-prefix:
    description: 'Prefix for auto-created labels'
    required: false
    default: 'issue-forge'

outputs:
  issues-created:
    description: 'Number of issues created'
  issues-updated:
    description: 'Number of issues updated'
  issues-skipped:
    description: 'Number of issues skipped'

runs:
  using: 'node20'
  main: 'dist/index.js'
```

- [ ] **Step 5: Create LICENSE (MIT)**

- [ ] **Step 6: Copy v1 source files from 1Take**

Copy these files preserving directory structure:
- `src/sources/asc-auth.ts`
- `src/sources/appstore-reviews.ts`
- `src/sources/appstore-crashes.ts`
- `src/sources/appstore-submission.ts`
- `src/github/dedup.ts`
- `src/github/issue-creator.ts`
- `tests/sources/asc-auth.test.ts`
- `tests/sources/appstore-reviews.test.ts`
- `tests/sources/appstore-crashes.test.ts`
- `tests/sources/appstore-submission.test.ts`
- `tests/dedup.test.ts`
- `tests/issue-creator.test.ts`

- [ ] **Step 7: npm install**

Run: `npm install`

- [ ] **Step 8: Run existing tests**

Run: `npx vitest run`
Expected: Tests may fail due to missing types.ts — that's OK, will be fixed in next task

- [ ] **Step 9: Commit**

```bash
git add action.yml package.json tsconfig.json vitest.config.ts LICENSE src/ tests/ package-lock.json
git commit -m "feat: scaffold v2 project with v1 source modules"
```

---

### Task 2: types.ts — 新しい型定義

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create types.ts**

```ts
// src/types.ts
export type SourceType = "review" | "appstore-crash" | "submission";

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

export interface SourceResult {
  sourceName: string;
  success: boolean;
  issuesCreated: number;
  issuesUpdated: number;
  issuesSkipped: number;
  error?: string;
}

export interface ActionInputs {
  appStoreAppId: string;
  ascIssuerId: string;
  ascKeyId: string;
  ascPrivateKey: string;
  sources: string[];
  githubToken: string;
  intervalHours: number;
  labelsPrefix: string;
  owner: string;
  repo: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Fix any import errors in copied v1 files (they may reference old types like `"crashlytics" | "analytics"`)

- [ ] **Step 3: Update v1 source files to use new SourceType**

Remove `"crashlytics" | "analytics"` from any type references. The v1 files already use the correct source types (`"review"`, `"appstore-crash"`, `"submission"`), so this should be minimal.

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: v1 tests should pass

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/sources/ src/github/
git commit -m "feat: add v2 types, remove Firebase source types"
```

---

### Task 3: inputs.ts — Action inputs パース・バリデーション

**Files:**
- Create: `src/inputs.ts`
- Create: `tests/inputs.test.ts`

- [ ] **Step 1: Write tests**

```ts
// tests/inputs.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@actions/core", () => ({
  getInput: vi.fn(),
  setSecret: vi.fn(),
  setFailed: vi.fn(),
  warning: vi.fn(),
}));

import * as core from "@actions/core";
import { parseInputs } from "../src/inputs.js";

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
      return "valid";
    });
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/inputs.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement inputs.ts**

```ts
// src/inputs.ts
import * as core from "@actions/core";
import type { ActionInputs } from "./types.js";

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

  // Mask secrets in logs
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

  return {
    appStoreAppId,
    ascIssuerId,
    ascKeyId,
    ascPrivateKey,
    sources,
    githubToken,
    intervalHours,
    labelsPrefix,
    owner,
    repo,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/inputs.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/inputs.ts tests/inputs.test.ts
git commit -m "feat: add Action inputs parsing with validation"
```

---

### Task 4: labels.ts — ラベル自動作成

**Files:**
- Create: `src/github/labels.ts`
- Create: `tests/labels.test.ts`

- [ ] **Step 1: Write tests**

```ts
// tests/labels.test.ts
import { describe, it, expect, vi } from "vitest";
import { ensureLabels, buildLabelDefinitions } from "../src/github/labels.js";

describe("buildLabelDefinitions", () => {
  it("generates labels with prefix", () => {
    const labels = buildLabelDefinitions("issue-forge");
    expect(labels).toContainEqual(
      expect.objectContaining({ name: "issue-forge" })
    );
    expect(labels).toContainEqual(
      expect.objectContaining({ name: "issue-forge:review" })
    );
    expect(labels).toContainEqual(
      expect.objectContaining({ name: "issue-forge:appstore-crash" })
    );
    expect(labels).toContainEqual(
      expect.objectContaining({ name: "issue-forge:submission" })
    );
  });

  it("uses custom prefix", () => {
    const labels = buildLabelDefinitions("my-prefix");
    expect(labels[0].name).toBe("my-prefix");
    expect(labels[1].name).toBe("my-prefix:review");
  });
});

describe("ensureLabels", () => {
  it("creates missing labels", async () => {
    const mockOctokit = {
      rest: {
        issues: {
          listLabelsForRepo: vi.fn().mockResolvedValue({ data: [] }),
          createLabel: vi.fn().mockResolvedValue({}),
        },
      },
    };
    await ensureLabels(mockOctokit as any, "owner", "repo", "issue-forge");
    expect(mockOctokit.rest.issues.createLabel).toHaveBeenCalled();
  });

  it("skips existing labels", async () => {
    const mockOctokit = {
      rest: {
        issues: {
          listLabelsForRepo: vi.fn().mockResolvedValue({
            data: [{ name: "issue-forge" }, { name: "issue-forge:review" },
                   { name: "issue-forge:appstore-crash" }, { name: "issue-forge:submission" }],
          }),
          createLabel: vi.fn().mockResolvedValue({}),
        },
      },
    };
    await ensureLabels(mockOctokit as any, "owner", "repo", "issue-forge");
    expect(mockOctokit.rest.issues.createLabel).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to fail**

- [ ] **Step 3: Implement labels.ts**

```ts
// src/github/labels.ts
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
  octokit: Octokit,
  owner: string,
  repo: string,
  prefix: string
): Promise<void> {
  const needed = buildLabelDefinitions(prefix);

  const { data: existing } = await octokit.rest.issues.listLabelsForRepo({
    owner,
    repo,
    per_page: 100,
  });
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/labels.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/github/labels.ts tests/labels.test.ts
git commit -m "feat: add automatic label creation"
```

---

### Task 5: ソースモジュールのリファクタ — config依存を除去

**Files:**
- Modify: `src/sources/appstore-reviews.ts`
- Modify: `src/sources/appstore-crashes.ts`
- Modify: `src/sources/appstore-submission.ts`
- Modify: corresponding test files

v1のソースクラスは constructor でパラメータを受け取る設計だが、ASC JWTが共有されていた。v2ではソースごとにJWT生成するため、constructorにASC認証情報を渡し、`fetch()` 内でJWT生成する。

- [ ] **Step 1: Update AppStoreReviewsSource**

Constructor: `(appId: string, issuerId: string, keyId: string, privateKey: string, intervalHours: number, labelsPrefix: string)`

`fetch()` 内で:
1. `generateAscToken(this.issuerId, this.keyId, this.privateKey)` でJWT生成
2. `createdDate` フィルタに `intervalHours` を使用
3. ラベルに `labelsPrefix` を使用

- [ ] **Step 2: Update AppStoreCrashesSource** (same pattern)

- [ ] **Step 3: Update AppStoreSubmissionSource** (same pattern)

- [ ] **Step 4: Update all source test files** to match new constructors

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/sources/ tests/sources/
git commit -m "refactor: decouple sources from shared config, JWT per-source"
```

---

### Task 6: index.ts — メインエントリポイント

**Files:**
- Create: `src/index.ts`
- Create: `tests/index.test.ts`

- [ ] **Step 1: Write tests**

Test `runSources` and `buildSummary` functions (exported for testing). `main()` is not directly tested but delegates to these.

```ts
// tests/index.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
  setFailed: vi.fn(),
  setOutput: vi.fn(),
  summary: { addRaw: vi.fn().mockReturnThis(), write: vi.fn() },
}));

import { runSources, buildSummary } from "../src/index.js";
import type { Source, IssueCandidate } from "../src/types.js";

function mockSource(name: string, candidates: IssueCandidate[]): Source {
  return { name, fetch: vi.fn().mockResolvedValue(candidates) };
}

function failingSource(name: string): Source {
  return { name, fetch: vi.fn().mockRejectedValue(new Error("API error")) };
}

describe("runSources", () => {
  it("processes all sources", async () => {
    const processFn = vi.fn().mockResolvedValue("created");
    const results = await runSources(
      [mockSource("reviews", []), mockSource("crashes", [])],
      processFn
    );
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it("continues on failure", async () => {
    const processFn = vi.fn().mockResolvedValue("created");
    const results = await runSources(
      [failingSource("reviews"), mockSource("crashes", [])],
      processFn
    );
    expect(results[0].success).toBe(false);
    expect(results[1].success).toBe(true);
  });
});

describe("buildSummary", () => {
  it("generates markdown table", () => {
    const results = [
      { sourceName: "reviews", success: true, issuesCreated: 2, issuesUpdated: 0, issuesSkipped: 1 },
      { sourceName: "crashes", success: true, issuesCreated: 0, issuesUpdated: 1, issuesSkipped: 0 },
    ];
    const md = buildSummary(results);
    expect(md).toContain("| reviews |");
    expect(md).toContain("| **Total** |");
  });
});
```

- [ ] **Step 2: Run test to fail**

- [ ] **Step 3: Implement index.ts**

The `main()` function:
1. `parseInputs()` → validate
2. Create Octokit with `githubToken`
3. `ensureLabels(octokit, owner, repo, labelsPrefix)`
4. Build source array:
   ```ts
   const sourceMap: Record<string, () => Source> = {
     reviews: () => new AppStoreReviewsSource(appId, issuerId, keyId, privateKey, intervalHours, labelsPrefix),
     crashes: () => new AppStoreCrashesSource(appId, issuerId, keyId, privateKey, labelsPrefix),
     submission: () => new AppStoreSubmissionSource(appId, issuerId, keyId, privateKey, labelsPrefix),
   };
   const sources = inputs.sources.map(s => sourceMap[s]()).filter(Boolean);
   ```
5. `runSources(sources, processFn)` where `processFn` calls `processCandidate(octokit, owner, repo, candidate)` which returns `"created" | "updated" | "skipped"`
6. Set outputs (`core.setOutput`) + write `$GITHUB_STEP_SUMMARY`
7. If all failed → `core.setFailed()`

**`runSources` counting logic:**
```ts
for (const candidate of candidates) {
  const result = await processFn(candidate); // returns "created" | "updated" | "skipped"
  if (result === "created") created++;
  else if (result === "updated") updated++;
  else skipped++;
}
```

Export `runSources` and `buildSummary` for testing. Guard `main()` with `if (!process.env.VITEST)` check.

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/index.test.ts
git commit -m "feat: add v2 entry point with inputs, labels, and summary"
```

---

### Task 7: ビルド + リリースワークフロー

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `.github/workflows/test.yml`

- [ ] **Step 1: Create test workflow**

```yaml
# .github/workflows/test.yml
name: Test
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
```

- [ ] **Step 2: Create release workflow**

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - name: Verify dist is up to date
        run: |
          git diff --exit-code dist/ || (echo "ERROR: dist/ is out of date" && exit 1)
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
```

- [ ] **Step 3: Build dist/**

Run: `npm run build`
Verify: `dist/index.js` exists

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ dist/
git commit -m "feat: add CI test workflow, release workflow, and initial dist build"
```

---

### Task 8: README.md — 公開ドキュメント

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README with sections:**

1. タイトル + 概要（英語）
2. Quick Start（ワークフロー例）
3. Inputs / Outputs テーブル
4. App Store Connect API Key 取得手順
5. Supported Sources
6. Label Scheme
7. How Deduplication Works
8. License

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup instructions and usage guide"
```

---

### Task 9: 全テスト + typecheck + ビルド検証

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `dist/index.js` generated

- [ ] **Step 4: Fix any issues and commit**

```bash
git add .
git commit -m "fix: resolve remaining test/type/build issues"
```

---

### Task 10: 1Takeの移行 + GitInflowへの展開

- [ ] **Step 1: Tag v1.0.0 on IssueForge repo**

```bash
git tag v1.0.0
git tag v1
git push origin main --tags
```

- [ ] **Step 2: Update 1Take workflow**

Replace `hakaru/1Take/.github/workflows/issue-forge.yml` with:
```yaml
name: IssueForge
on:
  schedule:
    - cron: '0 0,12 * * *'
  workflow_dispatch: {}

jobs:
  run:
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - uses: hakaru/IssueForge@v1
        with:
          app-store-app-id: "6757945099"
          asc-issuer-id: ${{ secrets.ASC_ISSUER_ID }}
          asc-key-id: ${{ secrets.ASC_KEY_ID }}
          asc-private-key: ${{ secrets.ASC_PRIVATE_KEY }}
```

- [ ] **Step 3: Delete 1Take/issue-forge/ directory**

- [ ] **Step 4: Commit and push 1Take changes**

- [ ] **Step 5: Add IssueForge workflow to GitInflow**

Create `hakaru/GitInflow/.github/workflows/issue-forge.yml` with GitInflow's App ID.

- [ ] **Step 6: Set ASC Secrets on GitInflow repo**

```bash
gh secret set ASC_ISSUER_ID --repo hakaru/GitInflow
gh secret set ASC_KEY_ID --repo hakaru/GitInflow
gh secret set ASC_PRIVATE_KEY --repo hakaru/GitInflow
```

- [ ] **Step 7: Test both repos**

Trigger manual runs on both 1Take and GitInflow to verify.
