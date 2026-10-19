// ============================================================
// Evaluation summary for the Evidence page.
//
// Representative metrics come only from computeReliabilityProfile
// (which drops targeted/risk cases). Targeted/risk counts use the
// same confusion-matrix cell definitions via classifyCasesForMatrix.
//
// A recorded revalidation decision is copied through unchanged.
// Trigger thresholds are not acceptance criteria and are never
// applied here. High overall agreement does not create a decision.
// ============================================================
import {
  classifyCasesForMatrix,
  computeReliabilityProfile,
  pct,
} from "@/core/metrics";
import type {
  EvaluationCase,
  Judgment,
  RevalidationDecision,
} from "@/core/types";

export interface RepresentativeSummary {
  sampleN: number;
  judgedN: number;
  correct: number;
  overallAgreement: number;
  /** False when the representative sample is empty (0/0). */
  agreementDefined: boolean;
  failRecall: number;
  /** False when there are no judged reference-FAIL cases (TP+FN = 0). */
  failRecallDefined: boolean;
  failRecallHits: number;
  failRecallSupport: number;
  failPrecision: number;
  /** False when the evaluator predicted no FAILs (TP+FP = 0). */
  failPrecisionDefined: boolean;
  failPrecisionHits: number;
  failPrecisionSupport: number;
  fp: number;
  fn: number;
  fpCaseIds: string[];
  fnCaseIds: string[];
}

export interface TargetedRiskSummary {
  sampleN: number;
  judgedN: number;
  /** Reference-FAIL cases in the targeted/risk stream. */
  failSupport: number;
  /** True positives: reference FAIL predicted FAIL. */
  failDetected: number;
  /** False when the stream has no reference-FAIL cases. */
  failDetectionDefined: boolean;
  /** False negatives: reference FAIL predicted PASS. */
  missedFailIds: string[];
  /** Reference-FAIL cases with no judgment on this run. */
  unevaluatedFailIds: string[];
  fp: number;
  fpCaseIds: string[];
  fn: number;
}

export interface EvaluationSummaryModel {
  evaluatorVersion: string;
  representative: RepresentativeSummary;
  targeted: TargetedRiskSummary;
  /**
   * Set only when a RevalidationDecision was recorded for this run.
   * Null for the baseline and for any candidate without a decision.
   */
  recordedDecision: RevalidationDecision | null;
}

export function formatDefinedPct(defined: boolean, value: number): string {
  return defined ? pct(value) : "—";
}

export function formatCountRatio(numerator: number, denominator: number): string {
  if (denominator <= 0) return "—";
  return `${numerator}/${denominator}`;
}

/**
 * Decision recorded for the run currently selected on the Evidence page.
 * Baseline runs are not candidates, so they resolve to null.
 */
export function recordedDecisionForRun(
  selectedRunId: string | null,
  candidates: ReadonlyArray<{ candidateId: string; revalidationRunId: string | null }>,
  decisions: ReadonlyArray<RevalidationDecision>,
): RevalidationDecision | null {
  if (!selectedRunId) return null;
  const match = candidates.find((c) => c.revalidationRunId === selectedRunId);
  if (!match) return null;
  return decisions.find((d) => d.candidateId === match.candidateId) ?? null;
}

export function buildEvaluationSummary(input: {
  cases: EvaluationCase[];
  judgments: Judgment[];
  evaluatorVersion: string;
  recordedDecision?: RevalidationDecision | null;
}): EvaluationSummaryModel {
  const { cases, judgments, evaluatorVersion } = input;
  const repCases = cases.filter((c) => c.sampleType === "representative");
  const trgCases = cases.filter((c) => c.sampleType === "targeted_risk");

  const profile = computeReliabilityProfile(cases, judgments, evaluatorVersion);
  const repIds = classifyCasesForMatrix(repCases, judgments);
  const trgIds = classifyCasesForMatrix(trgCases, judgments);
  const { TP, FP, TN, FN } = profile.confusionMatrix;

  const judgedIds = new Set(judgments.map((j) => j.caseId));
  const repIdSet = new Set(repCases.map((c) => c.id));
  const trgIdSet = new Set(trgCases.map((c) => c.id));

  const trgFailCases = trgCases.filter((c) => c.groundTruth === "FAIL");
  const missedFailIds = trgIds.FN;
  const unevaluatedFailIds = trgFailCases
    .map((c) => c.id)
    .filter((id) => !judgedIds.has(id));

  return {
    evaluatorVersion,
    representative: {
      sampleN: profile.sampleN,
      judgedN: judgments.filter((j) => repIdSet.has(j.caseId)).length,
      correct: TP + TN,
      overallAgreement: profile.overallAgreement,
      agreementDefined: profile.sampleN > 0,
      failRecall: profile.perClass.FAIL.recall,
      failRecallDefined: profile.perClass.FAIL.support > 0,
      failRecallHits: TP,
      failRecallSupport: TP + FN,
      failPrecision: profile.perClass.FAIL.precision,
      failPrecisionDefined: TP + FP > 0,
      failPrecisionHits: TP,
      failPrecisionSupport: TP + FP,
      fp: FP,
      fn: FN,
      fpCaseIds: repIds.FP,
      fnCaseIds: repIds.FN,
    },
    targeted: {
      sampleN: trgCases.length,
      judgedN: judgments.filter((j) => trgIdSet.has(j.caseId)).length,
      failSupport: trgFailCases.length,
      failDetected: trgIds.TP.length,
      failDetectionDefined: trgFailCases.length > 0,
      missedFailIds,
      unevaluatedFailIds,
      fp: trgIds.FP.length,
      fpCaseIds: trgIds.FP,
      fn: trgIds.FN.length,
    },
    recordedDecision: input.recordedDecision ?? null,
  };
}
