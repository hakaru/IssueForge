// src/config.ts
import type { Config } from "./types.js";

export const config: Config = {
  app: {
    name: "1Take",
    bundleId: "com.hakaru.1Take",
    firebaseProjectId: "",
    ga4PropertyId: "",
    bigqueryDataset: "",
    // Crashlyticsエクスポートのテーブル名: <bundle_id>_IOS 形式（ドットをアンダースコアに変換）
    crashlyticsTable: "com_hakaru_1Take_IOS",
    appStoreAppId: "",
  },
  schedule: {
    intervalHours: 12,
  },
  analytics: {
    thresholds: {
      dauDropPercent: 30,
      errorRatePercent: 5,
      crashFreeUsersBelow: 99,
    },
  },
};
