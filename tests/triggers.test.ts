// ============================================================
// Tests: trigger evaluation engine
// ============================================================
import { describe, it, expect } from "vitest";
import {
  evaluateMetricTrigger,
  evaluateChangeTrigger,
  evaluateAllTriggers,
} from "@/core/triggers";
import { computeReliabilityProfile } from "@/core/metrics";
import type {
  MetricTriggerConfig,
  EvaluationCase,
  Judgment,
  EvaluationConfiguration,
} from "@/core/types";

// ── Minimal profile for testing ───────────────────────────────
const repCases: EvaluationCase[] = [
  ...Array.from({ length: 54 }, (_, i) => ({
    id: `p${i}`,
    groundTruth: "PASS" as const,
    sampleType: "representative" as const,
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `f${i}`,
    groundTruth: "FAIL" as const,
    sampleType: "representative" as const,
  })),
];

const judgments: Judgment[] = [
  ...Array.from({ length: 51 }, (_, i) => ({
    caseId: `p${i}`,
    evaluatorVersion: "v0.2.0",
    predictedLabel: "PASS" as const,
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    caseId: `p${51 + i}`,
    evaluatorVersion: "v0.2.0",
    predictedLabel: "FAIL" as const,
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    caseId: `f${i}`,
    evaluatorVersion: "v0.2.0",
    predictedLabel: "FAIL" as const,
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    caseId: `f${3 + i}`,
    evaluatorVersion: "v0.2.0",
    predictedLabel: "PASS" as const,
  })),
];

const profile = computeReliabilityProfile(repCases, judgments, "v0.2.0");

// ── evaluateMetricTrigger ─────────────────────────────────────
describe("evaluateMetricTrigger", () => {
  const failRecallTrigger: MetricTriggerConfig = {
    id: "t1",
    type: "metric",
    metric: "fail_recall",
    operator: "<",
    threshold: 0.70,
    rationale: "Test trigger",
  };

  it("fires when fail_recall (0.50) < threshold (0.70)", () => {
    const result = evaluateMetricTrigger(failRecallTrigger, profile);
    expect(result.fired).toBe(true);
    expect(result.observedValue).toBeCloseTo(0.5, 5);
    expect(result.status).toBe("open");
  });

  it("does not fire when threshold would not be breached", () => {
    const t: MetricTriggerConfig = {
      ...failRecallTrigger,
      threshold: 0.40, // fail_recall (0.50) is NOT < 0.40
    };
    const result = evaluateMetricTrigger(t, profile);
    expect(result.fired).toBe(false);
    expect(result.status).toBe("closed");
  });

  it("fires for overall_agreement trigger", () => {
    const t: MetricTriggerConfig = {
      id: "t2",
      type: "metric",
      metric: "overall_agreement",
      operator: "<",
      threshold: 0.95, // 0.90 < 0.95
      rationale: "Test",
    };
    const result = evaluateMetricTrigger(t, profile);
    expect(result.fired).toBe(true);
  });

  it("returns closed for unknown metric key", () => {
    const t: MetricTriggerConfig = {
      id: "t3",
      type: "metric",
      metric: "nonexistent_metric",
      operator: "<",
      threshold: 0.5,
      rationale: "Test",
    };
    const result = evaluateMetricTrigger(t, profile);
    expect(result.fired).toBe(false);
    expect(result.note).toMatch(/Unknown metric/);
  });

  it("supports all operators", () => {
    const base = {
      id: "t",
      type: "metric" as const,
      metric: "fail_recall",
      rationale: "test",
    };
    // fail_recall = 0.5
    expect(evaluateMetricTrigger({ ...base, operator: ">", threshold: 0.3 }, profile).fired).toBe(true);
    expect(evaluateMetricTrigger({ ...base, operator: ">=", threshold: 0.5 }, profile).fired).toBe(true);
    expect(evaluateMetricTrigger({ ...base, operator: "<=", threshold: 0.5 }, profile).fired).toBe(true);
    expect(evaluateMetricTrigger({ ...base, operator: "==", threshold: 0.5 }, profile).fired).toBe(true);
    expect(evaluateMetricTrigger({ ...base, operator: "!=", threshold: 0.9 }, profile).fired).toBe(true);
  });
});

// ── evaluateChangeTrigger ─────────────────────────────────────
describe("evaluateChangeTrigger", () => {
  const baseline: EvaluationConfiguration = {
    evaluatorVersion: "v0.2.0",
    rubricVersion: "rubric-v0.2",
    taxonomyVersion: "taxonomy-v0.1",
    systemVersion: "system-v1.0",
  };

  const current: EvaluationConfiguration = { ...baseline };

  it("does not fire when configurations match", () => {
    const r = evaluateChangeTrigger(
      { id: "c1", type: "change", event: "evaluator_version_changed", rationale: "test" },
      current,
      baseline
    );
    expect(r.fired).toBe(false);
  });

  it("fires when evaluator version changed", () => {
    const r = evaluateChangeTrigger(
      { id: "c1", type: "change", event: "evaluator_version_changed", rationale: "test" },
      { ...current, evaluatorVersion: "v0.3.0-candidate" },
      baseline
    );
    expect(r.fired).toBe(true);
    expect(r.status).toBe("open");
  });

  it("fires when rubric version changed", () => {
    const r = evaluateChangeTrigger(
      { id: "c2", type: "change", event: "rubric_version_changed", rationale: "test" },
      { ...current, rubricVersion: "rubric-v0.3" },
      baseline
    );
    expect(r.fired).toBe(true);
  });

  it("does not fire for external_distribution_shift_event by default", () => {
    const r = evaluateChangeTrigger(
      { id: "c3", type: "change", event: "external_distribution_shift_event", rationale: "test" },
      current,
      baseline
    );
    expect(r.fired).toBe(false);
  });
});

// ── evaluateAllTriggers ───────────────────────────────────────
describe("evaluateAllTriggers", () => {
  const baseline: EvaluationConfiguration = {
    evaluatorVersion: "v0.2.0",
    rubricVersion: "rubric-v0.2",
    taxonomyVersion: "taxonomy-v0.1",
    systemVersion: "system-v1.0",
  };

  it("returns one result per trigger config", () => {
    const configs = [
      { id: "m1", type: "metric" as const, metric: "fail_recall", operator: "<" as const, threshold: 0.7, rationale: "r" },
      { id: "c1", type: "change" as const, event: "evaluator_version_changed", rationale: "r" },
    ];
    const results = evaluateAllTriggers(configs, profile, baseline, baseline);
    expect(results).toHaveLength(2);
  });

  it("metric trigger fires, change trigger does not (same config)", () => {
    const configs = [
      { id: "m1", type: "metric" as const, metric: "fail_recall", operator: "<" as const, threshold: 0.7, rationale: "r" },
      { id: "c1", type: "change" as const, event: "evaluator_version_changed", rationale: "r" },
    ];
    const results = evaluateAllTriggers(configs, profile, baseline, baseline);
    expect(results[0].fired).toBe(true);  // fail_recall (0.5) < 0.7
    expect(results[1].fired).toBe(false); // versions match
  });
});
