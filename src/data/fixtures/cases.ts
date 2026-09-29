// ============================================================
// Fixture: Evaluation Cases
//
// Scenario: binary PASS/FAIL, class imbalance ~90/10
//
// Representative sample (60 cases):
//   54 PASS + 6 FAIL → 90% / 10% prevalence
//
// Targeted/risk sample (10 cases):
//   Used ONLY for failure investigation.
//   NOT valid for population-level estimates.
// ============================================================
import type { EvaluationCase } from "@/core/types";

// ── Representative PASS (54) ──────────────────────────────────
const representativePASS: EvaluationCase[] = Array.from({ length: 54 }, (_, i) => ({
  id: `rep-${String(i + 1).padStart(3, "0")}`,
  groundTruth: "PASS" as const,
  sampleType: "representative" as const,
}));

// ── Representative FAIL (6) ───────────────────────────────────
const representativeFAIL: EvaluationCase[] = Array.from({ length: 6 }, (_, i) => ({
  id: `rep-fail-${String(i + 1).padStart(3, "0")}`,
  groundTruth: "FAIL" as const,
  sampleType: "representative" as const,
}));

// ── Targeted/Risk FAIL (8) ────────────────────────────────────
const targetedFAIL: EvaluationCase[] = Array.from({ length: 8 }, (_, i) => ({
  id: `trg-fail-${String(i + 1).padStart(3, "0")}`,
  groundTruth: "FAIL" as const,
  sampleType: "targeted_risk" as const,
  description: "Selected for targeted review: evaluator predicted PASS on high-stakes case.",
}));

// ── Targeted/Risk PASS edge cases (2) ─────────────────────────
const targetedPASS: EvaluationCase[] = Array.from({ length: 2 }, (_, i) => ({
  id: `trg-pass-${String(i + 1).padStart(3, "0")}`,
  groundTruth: "PASS" as const,
  sampleType: "targeted_risk" as const,
  description: "Near-boundary PASS case flagged for quality review.",
}));

export const allCases: EvaluationCase[] = [
  ...representativePASS,
  ...representativeFAIL,
  ...targetedFAIL,
  ...targetedPASS,
];

export { representativePASS, representativeFAIL, targetedFAIL, targetedPASS };
