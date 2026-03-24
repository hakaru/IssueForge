import type { IssueCandidate, Source } from "../types.js";
export interface DiagnosticSignature {
    id: string;
    attributes: {
        diagnosticType: string;
        signature: string;
        weight: number;
    };
}
export declare function formatCrashIssue(sig: DiagnosticSignature, labelsPrefix?: string): IssueCandidate;
export declare class AppStoreCrashesSource implements Source {
    private readonly appId;
    private readonly issuerId;
    private readonly keyId;
    private readonly privateKey;
    private readonly labelsPrefix;
    readonly name = "appstore-crashes";
    constructor(appId: string, issuerId: string, keyId: string, privateKey: string, labelsPrefix?: string);
    fetch(): Promise<IssueCandidate[]>;
}
