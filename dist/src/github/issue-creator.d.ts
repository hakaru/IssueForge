import type { Octokit } from "@octokit/rest";
import type { IssueCandidate } from "../types.js";
export type ProcessResult = "created" | "updated" | "skipped";
export declare function processCandidate(octokit: Octokit, owner: string, repo: string, candidate: IssueCandidate): Promise<ProcessResult>;
