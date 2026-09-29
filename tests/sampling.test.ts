// ============================================================
// Tests: sampling logic
// ============================================================
import { describe, it, expect } from "vitest";
import {
  getRepresentativeSample,
  getTargetedRiskSample,
  computePrevalence,
  describeSamplingPlan,
} from "@/core/sampling";
import type { EvaluationCase } from "@/core/types";

const mixedCases: EvaluationCase[] = [
  { id: "r1", groundTruth: "PASS", sampleType: "representative" },
  { id: "r2", groundTruth: "PASS", sampleType: "representative" },
  { id: "r3", groundTruth: "FAIL", sampleType: "representative" },
  { id: "t1", groundTruth: "FAIL", sampleType: "targeted_risk" },
  { id: "t2", groundTruth: "FAIL", sampleType: "targeted_risk" },
];

describe("getRepresentativeSample", () => {
  it("returns only representative cases", () => {
    const rep = getRepresentativeSample(mixedCases);
    expect(rep).toHaveLength(3);
    expect(rep.every((c) => c.sampleType === "representative")).toBe(true);
  });
});

describe("getTargetedRiskSample", () => {
  it("returns only targeted_risk cases", () => {
    const trg = getTargetedRiskSample(mixedCases);
    expect(trg).toHaveLength(2);
    expect(trg.every((c) => c.sampleType === "targeted_risk")).toBe(true);
  });
});

describe("computePrevalence", () => {
  it("computes correct proportions", () => {
    const rep = getRepresentativeSample(mixedCases);
    const prev = computePrevalence(rep);
    expect(prev.PASS).toBeCloseTo(2 / 3, 5);
    expect(prev.FAIL).toBeCloseTo(1 / 3, 5);
    expect(prev.PASS + prev.FAIL).toBeCloseTo(1, 5);
  });

  it("returns 0 for empty input", () => {
    const prev = computePrevalence([]);
    expect(prev.PASS).toBe(0);
    expect(prev.FAIL).toBe(0);
  });
});

describe("describeSamplingPlan", () => {
  it("counts correctly", () => {
    const plan = describeSamplingPlan(mixedCases);
    expect(plan.totalCases).toBe(5);
    expect(plan.representativeN).toBe(3);
    expect(plan.targetedRiskN).toBe(2);
  });

  it("stratification note mentions targeted not for population estimates", () => {
    const plan = describeSamplingPlan(mixedCases);
    expect(plan.stratificationNote).toMatch(/not for population/i);
  });
});
