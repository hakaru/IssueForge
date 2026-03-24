import type { IssueCandidate, Source } from "../types.js";
export interface AppStoreVersion {
    id: string;
    attributes: {
        versionString: string;
        appStoreState: string;
        createdDate: string;
    };
}
export declare const RELEVANT_STATES: Set<string>;
export declare function isRelevantStatusChange(state: string): boolean;
export declare function formatSubmissionIssue(version: AppStoreVersion, labelsPrefix?: string): IssueCandidate;
export declare class AppStoreSubmissionSource implements Source {
    private readonly appId;
    private readonly issuerId;
    private readonly keyId;
    private readonly privateKey;
    private readonly labelsPrefix;
    readonly name = "appstore-submission";
    constructor(appId: string, issuerId: string, keyId: string, privateKey: string, labelsPrefix?: string);
    fetch(): Promise<IssueCandidate[]>;
}
