import type { Octokit } from "@octokit/rest";
interface LabelDef {
    name: string;
    color: string;
    description: string;
}
export declare function buildLabelDefinitions(prefix: string): LabelDef[];
export declare function ensureLabels(octokit: Octokit, owner: string, repo: string, prefix: string): Promise<void>;
export {};
