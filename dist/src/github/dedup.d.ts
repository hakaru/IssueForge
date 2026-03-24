import type { Octokit } from "@octokit/rest";
import type { SourceType } from "../types.js";
export declare function buildDedupMarker(sourceType: SourceType, key: string): string;
export declare function extractDedupKey(body: string, sourceType: SourceType): string | null;
export declare function findExistingIssue(octokit: Octokit, owner: string, repo: string, sourceType: SourceType, key: string): Promise<number | null>;
