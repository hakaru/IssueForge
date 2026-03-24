import type { IssueCandidate, Source } from "../types.js";
export interface AppStoreReview {
    id: string;
    attributes: {
        rating: number;
        title: string;
        body: string;
        reviewerNickname: string;
        createdDate: string;
    };
    relationships: {
        response: {
            data: null | unknown;
        };
    };
}
export declare function formatReviewIssue(review: AppStoreReview, appVersion: string, labelsPrefix?: string): IssueCandidate;
export declare class AppStoreReviewsSource implements Source {
    private readonly appId;
    private readonly issuerId;
    private readonly keyId;
    private readonly privateKey;
    private readonly appVersion;
    private readonly intervalHours;
    private readonly labelsPrefix;
    readonly name = "appstore-reviews";
    constructor(appId: string, issuerId: string, keyId: string, privateKey: string, appVersion?: string, intervalHours?: number, labelsPrefix?: string);
    fetch(): Promise<IssueCandidate[]>;
}
