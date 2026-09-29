// ============================================================
// Judge Health – Sampling Logic
// Validates that representative and targeted_risk samples
// are kept analytically separate.
// ============================================================

import type { EvaluationCase, SamplingPlan, Label } from "@/core/types";

/**
 * Returns only the representative sub-sample.
 * This is the ONLY set valid for population-level estimates.
 */
export function getRepresentativeSample(
  cases: EvaluationCase[]
): EvaluationCase[] {
  return cases.filter((c) => c.sampleType === "representative");
}

/**
 * Returns only the targeted/risk sub-sample.
 * Useful for failure investigation, NOT for population estimates.
 */
export function getTargetedRiskSample(
  cases: EvaluationCase[]
): EvaluationCase[] {
  return cases.filter((c) => c.sampleType === "targeted_risk");
}

/**
 * Compute prevalence from the representative sample only.
 */
export function computePrevalence(
  repSample: EvaluationCase[]
): Record<Label, number> {
  const counts: Record<Label, number> = { PASS: 0, FAIL: 0 };
  for (const c of repSample) counts[c.groundTruth]++;
  const total = repSample.length;
  return {
    PASS: total > 0 ? counts.PASS / total : 0,
    FAIL: total > 0 ? counts.FAIL / total : 0,
  };
}

/**
 * Describe the sampling plan for the fixture set.
 */
export function describeSamplingPlan(
  cases: EvaluationCase[]
): SamplingPlan {
  const rep = getRepresentativeSample(cases);
  const targeted = getTargetedRiskSample(cases);

  const repByClass = computePrevalence(rep);
  const stratNote = `Representative: ${rep.length} cases (${Math.round(
    repByClass.PASS * 100
  )}% PASS / ${Math.round(
    repByClass.FAIL * 100
  )}% FAIL). Targeted-risk: ${targeted.length} cases (failure-investigation only, not for population estimates).`;

  return {
    totalCases: cases.length,
    representativeN: rep.length,
    targetedRiskN: targeted.length,
    stratificationNote: stratNote,
  };
}
