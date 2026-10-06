// ============================================================
// Judge Health – Metrics Engine (core)
// Implements Wilson CI, confusion matrix, per-class metrics,
// and the full ReliabilityProfile computation.
//
// IMPORTANT: No metric is hard-coded in any React component.
// All values flow through this module.
// ============================================================

import type {
  Label,
  Judgment,
  EvaluationCase,
  BinaryConfusionMatrix,
  WilsonInterval,
  PerClassMetrics,
  ReliabilityProfile,
} from "@/core/types";

// ── Wilson score interval ─────────────────────────────────────
// Reference: Wilson (1927). Equation 18 from:
// https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval#Wilson_score_interval
const Z_95 = 1.96;

export function wilsonInterval(k: number, n: number, z = Z_95): WilsonInterval {
  if (n === 0) {
    return { lower: 0, upper: 0, center: 0, n: 0 };
  }
  const z2 = z * z;
  const phat = k / n;
  const denom = n + z2;
  const center = (k + z2 / 2) / denom;
  const halfWidth =
    (z * Math.sqrt((k * (n - k)) / n + z2 / 4)) / denom;
  return {
    lower: Math.max(0, center - halfWidth),
    upper: Math.min(1, center + halfWidth),
    center,
    n,
  };
}

// ── Build confusion matrix ────────────────────────────────────
// Positive class = FAIL (minority / high-stakes)
export function buildConfusionMatrix(
  cases: EvaluationCase[],
  judgments: Judgment[]
): BinaryConfusionMatrix {
  const truthMap = new Map(cases.map((c) => [c.id, c.groundTruth]));
  const judgeMap = new Map(judgments.map((j) => [j.caseId, j.predictedLabel]));

  let TP = 0, FP = 0, TN = 0, FN = 0;

  for (const [caseId, truth] of truthMap) {
    const predicted = judgeMap.get(caseId);
    if (predicted === undefined) continue; // skip cases without a judgment

    if (truth === "FAIL" && predicted === "FAIL") TP++;
    else if (truth === "PASS" && predicted === "FAIL") FP++;
    else if (truth === "PASS" && predicted === "PASS") TN++;
    else if (truth === "FAIL" && predicted === "PASS") FN++;
  }

  return { TP, FP, TN, FN };
}

// ── Per-class metrics from confusion matrix ───────────────────
export function computePerClassMetrics(
  cm: BinaryConfusionMatrix
): Record<Label, PerClassMetrics> {
  const { TP, FP, TN, FN } = cm;

  // FAIL class (positive)
  const failRecall = TP + FN > 0 ? TP / (TP + FN) : 0;
  const failPrecision = TP + FP > 0 ? TP / (TP + FP) : 0;
  const failFPR = FP + TN > 0 ? FP / (FP + TN) : 0; // rate among actual PASS
  const failFNR = TP + FN > 0 ? FN / (TP + FN) : 0;

  // PASS class (negative)
  const passRecall = TN + FP > 0 ? TN / (TN + FP) : 0;
  const passPrecision = TN + FN > 0 ? TN / (TN + FN) : 0;
  const passFPR = TP + FN > 0 ? FN / (TP + FN) : 0; // misclassification among actual FAIL
  const passFNR = TN + FP > 0 ? FP / (TN + FP) : 0;

  return {
    FAIL: {
      precision: failPrecision,
      recall: failRecall,
      falsePositiveRate: failFPR,
      falseNegativeRate: failFNR,
      support: TP + FN,
      recallCI: wilsonInterval(TP, TP + FN),
      precisionCI: wilsonInterval(TP, TP + FP),
    },
    PASS: {
      precision: passPrecision,
      recall: passRecall,
      falsePositiveRate: passFPR,
      falseNegativeRate: passFNR,
      support: TN + FP,
      recallCI: wilsonInterval(TN, TN + FP),
      precisionCI: wilsonInterval(TN, TN + FN),
    },
  };
}

// ── Full reliability profile ──────────────────────────────────
export function computeReliabilityProfile(
  cases: EvaluationCase[],
  judgments: Judgment[],
  evaluatorVersion: string
): ReliabilityProfile {
  // Only use representative sample for population estimates
  const repCases = cases.filter((c) => c.sampleType === "representative");

  const repJudgments = judgments.filter((j) =>
    repCases.some((c) => c.id === j.caseId)
  );

  const n = repCases.length;

  const cm = buildConfusionMatrix(repCases, repJudgments);
  const { TP, FP, TN, FN } = cm;

  const correctCount = TP + TN;
  const overallAgreement = n > 0 ? correctCount / n : 0;
  const overallAgreementCI = wilsonInterval(correctCount, n);

  const classCounts: Record<Label, number> = {
    PASS: TN + FP, // all actual PASS
    FAIL: TP + FN, // all actual FAIL
  };

  const perClass = computePerClassMetrics(cm);

  // Identify widest recall CI (uncertainty spotlight)
  const failWidth =
    perClass.FAIL.recallCI.upper - perClass.FAIL.recallCI.lower;
  const passWidth =
    perClass.PASS.recallCI.upper - perClass.PASS.recallCI.lower;

  const widestRecallClass: Label = failWidth >= passWidth ? "FAIL" : "PASS";

  return {
    evaluatorVersion,
    sampleN: n,
    classCounts,
    overallAgreement,
    overallAgreementCI,
    confusionMatrix: cm,
    perClass,
    uncertainty: {
      note:
        "CI width reflects sample size per class. Minority class estimates carry higher uncertainty.",
      widestRecallCI: perClass[widestRecallClass].recallCI,
      widestRecallClass,
    },
  };
}

// ── Utility: round to N decimals ──────────────────────────────
export function pct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

// ── Case-level matrix classification ─────────────────────────
// Like buildConfusionMatrix but returns the caseId arrays per cell
// instead of just counts. Used to build clickable matrix drawers.
export interface MatrixCaseIds {
  TP: string[]; // truth=FAIL, predicted=FAIL
  FP: string[]; // truth=PASS, predicted=FAIL
  TN: string[]; // truth=PASS, predicted=PASS
  FN: string[]; // truth=FAIL, predicted=PASS  (missed FAIL — high-stakes)
}

export function classifyCasesForMatrix(
  cases: EvaluationCase[],
  judgments: Judgment[]
): MatrixCaseIds {
  const truthMap = new Map(cases.map((c) => [c.id, c.groundTruth]));
  const judgeMap = new Map(judgments.map((j) => [j.caseId, j.predictedLabel]));

  const result: MatrixCaseIds = { TP: [], FP: [], TN: [], FN: [] };

  for (const [caseId, truth] of truthMap) {
    const predicted = judgeMap.get(caseId);
    if (predicted === undefined) continue;

    if (truth === "FAIL" && predicted === "FAIL") result.TP.push(caseId);
    else if (truth === "PASS" && predicted === "FAIL") result.FP.push(caseId);
    else if (truth === "PASS" && predicted === "PASS") result.TN.push(caseId);
    else if (truth === "FAIL" && predicted === "PASS") result.FN.push(caseId);
  }

  return result;
}
