export type SourceType = "review" | "appstore-crash" | "submission";
export type DedupConfig = {
    strategy: "merge";
    key: string;
} | {
    strategy: "create-once";
    key: string;
} | {
    strategy: "always-new";
};
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
