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
  /** BigQueryのCrashlyticsテーブル名。通常は `<bundle_id>_IOS` 等の形式。 */
  crashlyticsTable: string;
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
