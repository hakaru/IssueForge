import type { Source, IssueCandidate, SourceResult } from "./types.js";
type ProcessFn = (candidate: IssueCandidate) => Promise<string>;
export declare function runSources(sources: Source[], processFn: ProcessFn): Promise<SourceResult[]>;
export declare function buildSummary(results: SourceResult[]): string;
export {};
