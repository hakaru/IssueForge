import { describe, it, expect } from "vitest";
import { detectAnomalies } from "../../src/sources/analytics.js";

describe("detectAnomalies", () => {
  it("detects DAU drop exceeding threshold", () => {
    const today = { dau: 700, errorRate: 2, crashFreeUsers: 99.5 };
    const yesterday = { dau: 1100, errorRate: 2, crashFreeUsers: 99.5 };
    const thresholds = { dauDropPercent: 30, errorRatePercent: 5, crashFreeUsersBelow: 99 };
    const anomalies = detectAnomalies(today, yesterday, thresholds);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].sourceType).toBe("analytics");
    expect(anomalies[0].title).toContain("DAU");
  });

  it("detects error rate exceeding threshold", () => {
    const today = { dau: 1000, errorRate: 7, crashFreeUsers: 99.5 };
    const yesterday = { dau: 1000, errorRate: 2, crashFreeUsers: 99.5 };
    const thresholds = { dauDropPercent: 30, errorRatePercent: 5, crashFreeUsersBelow: 99 };
    const anomalies = detectAnomalies(today, yesterday, thresholds);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].title).toContain("エラー率");
  });

  it("detects crash free rate below threshold", () => {
    const today = { dau: 1000, errorRate: 2, crashFreeUsers: 98.2 };
    const yesterday = { dau: 1000, errorRate: 2, crashFreeUsers: 99.5 };
    const thresholds = { dauDropPercent: 30, errorRatePercent: 5, crashFreeUsersBelow: 99 };
    const anomalies = detectAnomalies(today, yesterday, thresholds);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].title).toContain("クラッシュフリー率");
  });

  it("returns empty when all metrics normal", () => {
    const today = { dau: 1000, errorRate: 2, crashFreeUsers: 99.5 };
    const yesterday = { dau: 1050, errorRate: 2, crashFreeUsers: 99.5 };
    const thresholds = { dauDropPercent: 30, errorRatePercent: 5, crashFreeUsersBelow: 99 };
    const anomalies = detectAnomalies(today, yesterday, thresholds);
    expect(anomalies).toHaveLength(0);
  });

  it("uses create-once with metric+date key", () => {
    const today = { dau: 500, errorRate: 2, crashFreeUsers: 99.5 };
    const yesterday = { dau: 1000, errorRate: 2, crashFreeUsers: 99.5 };
    const thresholds = { dauDropPercent: 30, errorRatePercent: 5, crashFreeUsersBelow: 99 };
    const anomalies = detectAnomalies(today, yesterday, thresholds);
    expect(anomalies[0].dedup.strategy).toBe("create-once");
    expect((anomalies[0].dedup as any).key).toMatch(/^dau-drop-\d{4}-\d{2}-\d{2}$/);
  });

  it("detects multiple anomalies simultaneously", () => {
    const today = { dau: 500, errorRate: 7, crashFreeUsers: 98 };
    const yesterday = { dau: 1000, errorRate: 2, crashFreeUsers: 99.5 };
    const thresholds = { dauDropPercent: 30, errorRatePercent: 5, crashFreeUsersBelow: 99 };
    const anomalies = detectAnomalies(today, yesterday, thresholds);
    expect(anomalies).toHaveLength(3);
  });
});
