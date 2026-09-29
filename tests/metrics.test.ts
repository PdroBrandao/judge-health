// ============================================================
// Tests: metrics engine
// ============================================================
import { describe, it, expect } from "vitest";
import {
  wilsonInterval,
  buildConfusionMatrix,
  computePerClassMetrics,
  computeReliabilityProfile,
} from "@/core/metrics";
import type { EvaluationCase, Judgment } from "@/core/types";

// ── wilsonInterval ────────────────────────────────────────────
describe("wilsonInterval", () => {
  it("returns [0,0] for n=0", () => {
    const ci = wilsonInterval(0, 0);
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBe(0);
    expect(ci.n).toBe(0);
  });

  it("is symmetric around 0.5 for k=n/2", () => {
    const ci = wilsonInterval(5, 10);
    const delta = 1e-9;
    expect(ci.center).toBeCloseTo(0.5, 5);
    expect(ci.upper - ci.center).toBeCloseTo(ci.center - ci.lower, 5);
  });

  it("lower bound is >= 0 and upper bound <= 1", () => {
    for (const [k, n] of [[0, 1], [1, 1], [0, 100], [100, 100], [3, 6]]) {
      const ci = wilsonInterval(k as number, n as number);
      expect(ci.lower).toBeGreaterThanOrEqual(0);
      expect(ci.upper).toBeLessThanOrEqual(1);
    }
  });

  it("known value: k=3, n=6 → center ~0.5", () => {
    const ci = wilsonInterval(3, 6);
    expect(ci.center).toBeCloseTo(0.5, 2);
    // Wide CI: minority class with small n
    expect(ci.upper - ci.lower).toBeGreaterThan(0.5);
  });

  it("known value: k=54, n=60 → center close to 0.9", () => {
    const ci = wilsonInterval(54, 60);
    expect(ci.center).toBeCloseTo(0.876, 1);
  });
});

// ── buildConfusionMatrix ──────────────────────────────────────
describe("buildConfusionMatrix", () => {
  const cases: EvaluationCase[] = [
    { id: "a", groundTruth: "FAIL", sampleType: "representative" },
    { id: "b", groundTruth: "FAIL", sampleType: "representative" },
    { id: "c", groundTruth: "PASS", sampleType: "representative" },
    { id: "d", groundTruth: "PASS", sampleType: "representative" },
  ];

  it("perfect evaluator → TP=2, TN=2, FP=0, FN=0", () => {
    const judgments: Judgment[] = [
      { caseId: "a", evaluatorVersion: "v1", predictedLabel: "FAIL" },
      { caseId: "b", evaluatorVersion: "v1", predictedLabel: "FAIL" },
      { caseId: "c", evaluatorVersion: "v1", predictedLabel: "PASS" },
      { caseId: "d", evaluatorVersion: "v1", predictedLabel: "PASS" },
    ];
    const cm = buildConfusionMatrix(cases, judgments);
    expect(cm.TP).toBe(2);
    expect(cm.TN).toBe(2);
    expect(cm.FP).toBe(0);
    expect(cm.FN).toBe(0);
  });

  it("worst evaluator → FP=2, FN=2, TP=0, TN=0", () => {
    const judgments: Judgment[] = [
      { caseId: "a", evaluatorVersion: "v1", predictedLabel: "PASS" }, // FN
      { caseId: "b", evaluatorVersion: "v1", predictedLabel: "PASS" }, // FN
      { caseId: "c", evaluatorVersion: "v1", predictedLabel: "FAIL" }, // FP
      { caseId: "d", evaluatorVersion: "v1", predictedLabel: "FAIL" }, // FP
    ];
    const cm = buildConfusionMatrix(cases, judgments);
    expect(cm.TP).toBe(0);
    expect(cm.TN).toBe(0);
    expect(cm.FP).toBe(2);
    expect(cm.FN).toBe(2);
  });

  it("skips cases without a judgment", () => {
    const judgments: Judgment[] = [
      { caseId: "a", evaluatorVersion: "v1", predictedLabel: "FAIL" },
      // b missing
      { caseId: "c", evaluatorVersion: "v1", predictedLabel: "PASS" },
      { caseId: "d", evaluatorVersion: "v1", predictedLabel: "PASS" },
    ];
    const cm = buildConfusionMatrix(cases, judgments);
    expect(cm.TP + cm.FP + cm.TN + cm.FN).toBe(3); // only 3 judged
  });
});

// ── computePerClassMetrics ────────────────────────────────────
describe("computePerClassMetrics", () => {
  it("fail_recall = TP/(TP+FN)", () => {
    const m = computePerClassMetrics({ TP: 3, FN: 3, FP: 3, TN: 51 });
    expect(m.FAIL.recall).toBeCloseTo(0.5, 5);
  });

  it("pass_recall = TN/(TN+FP)", () => {
    const m = computePerClassMetrics({ TP: 3, FN: 3, FP: 3, TN: 51 });
    expect(m.PASS.recall).toBeCloseTo(51 / 54, 5);
  });

  it("handles zero denominators gracefully", () => {
    const m = computePerClassMetrics({ TP: 0, FN: 0, FP: 0, TN: 0 });
    expect(m.FAIL.recall).toBe(0);
    expect(m.PASS.recall).toBe(0);
  });

  it("all correct → all recalls = 1.0", () => {
    const m = computePerClassMetrics({ TP: 10, FN: 0, FP: 0, TN: 90 });
    expect(m.FAIL.recall).toBe(1);
    expect(m.PASS.recall).toBe(1);
  });
});

// ── computeReliabilityProfile ─────────────────────────────────
describe("computeReliabilityProfile (fixture scenario)", () => {
  // Baseline fixture: 54 PASS + 6 FAIL in representative sample
  // 51 PASS correct, 3 PASS misclassified as FAIL
  // 3 FAIL correct, 3 FAIL misclassified as PASS
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
    // 51 correct PASS
    ...Array.from({ length: 51 }, (_, i) => ({
      caseId: `p${i}`,
      evaluatorVersion: "v0.2.0",
      predictedLabel: "PASS" as const,
    })),
    // 3 misclassified PASS
    ...Array.from({ length: 3 }, (_, i) => ({
      caseId: `p${51 + i}`,
      evaluatorVersion: "v0.2.0",
      predictedLabel: "FAIL" as const,
    })),
    // 3 correct FAIL
    ...Array.from({ length: 3 }, (_, i) => ({
      caseId: `f${i}`,
      evaluatorVersion: "v0.2.0",
      predictedLabel: "FAIL" as const,
    })),
    // 3 missed FAIL
    ...Array.from({ length: 3 }, (_, i) => ({
      caseId: `f${3 + i}`,
      evaluatorVersion: "v0.2.0",
      predictedLabel: "PASS" as const,
    })),
  ];

  it("overall agreement = 54/60 = 90%", () => {
    const p = computeReliabilityProfile(repCases, judgments, "v0.2.0");
    expect(p.overallAgreement).toBeCloseTo(54 / 60, 5);
  });

  it("FAIL recall = 3/6 = 50% (dangerous minority-class gap)", () => {
    const p = computeReliabilityProfile(repCases, judgments, "v0.2.0");
    expect(p.perClass.FAIL.recall).toBeCloseTo(0.5, 5);
  });

  it("PASS recall = 51/54 ≈ 94.4%", () => {
    const p = computeReliabilityProfile(repCases, judgments, "v0.2.0");
    expect(p.perClass.PASS.recall).toBeCloseTo(51 / 54, 5);
  });

  it("confusion matrix: TP=3, FN=3, FP=3, TN=51", () => {
    const p = computeReliabilityProfile(repCases, judgments, "v0.2.0");
    expect(p.confusionMatrix.TP).toBe(3);
    expect(p.confusionMatrix.FN).toBe(3);
    expect(p.confusionMatrix.FP).toBe(3);
    expect(p.confusionMatrix.TN).toBe(51);
  });

  it("sampleN = 60 (only representative)", () => {
    // Add a targeted_risk case — must be excluded
    const withTargeted: EvaluationCase[] = [
      ...repCases,
      { id: "trg-1", groundTruth: "FAIL", sampleType: "targeted_risk" },
    ];
    const p = computeReliabilityProfile(withTargeted, judgments, "v0.2.0");
    expect(p.sampleN).toBe(60);
  });

  it("FAIL class has widest recall CI (small n)", () => {
    const p = computeReliabilityProfile(repCases, judgments, "v0.2.0");
    const failWidth = p.perClass.FAIL.recallCI.upper - p.perClass.FAIL.recallCI.lower;
    const passWidth = p.perClass.PASS.recallCI.upper - p.perClass.PASS.recallCI.lower;
    expect(failWidth).toBeGreaterThan(passWidth);
  });

  it("overallAgreementCI contains the observed agreement", () => {
    const p = computeReliabilityProfile(repCases, judgments, "v0.2.0");
    expect(p.overallAgreementCI.lower).toBeLessThanOrEqual(p.overallAgreement);
    expect(p.overallAgreementCI.upper).toBeGreaterThanOrEqual(p.overallAgreement);
  });
});
