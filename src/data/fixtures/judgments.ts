// ============================================================
// Fixture: Baseline and Candidate Evaluator Judgments
//
// BASELINE evaluator (v0.2.0) on representative sample (60):
//   PASS cases (54): 51 correct (PASS), 3 wrong (FAIL) → recall 94.4%
//   FAIL cases  (6):  3 correct (FAIL), 3 wrong (PASS) → recall 50.0%
//   Overall agreement: 54/60 = 90.0%
//
// KEY INSIGHT the dashboard must surface:
//   90% overall hides 50% recall on the minority/high-stakes class.
//
// CANDIDATE evaluator (v0.3.0-candidate) on representative sample (60):
//   PASS cases (54): 53 correct, 1 wrong → recall 98.1%
//   FAIL cases  (6):  5 correct, 1 wrong → recall 83.3%
//   Overall: 58/60 = 96.7%  (still under revalidation)
// ============================================================
import type { Judgment } from "@/core/types";
import { allCases } from "./cases";

// ── Helper ────────────────────────────────────────────────────
function judgeCase(
  caseId: string,
  predicted: "PASS" | "FAIL",
  version: string
): Judgment {
  return { caseId, evaluatorVersion: version, predictedLabel: predicted };
}

// ── Baseline: rep PASS cases (51 correct, 3 wrong) ───────────
// Cases rep-001 to rep-054; first 51 predicted correctly as PASS,
// last 3 misclassified as FAIL
const repPassCaseIds = allCases
  .filter((c) => c.sampleType === "representative" && c.groundTruth === "PASS")
  .map((c) => c.id);

export const baselineJudgments: Judgment[] = [
  // 51 correctly classified PASS cases
  ...repPassCaseIds.slice(0, 51).map((id) => judgeCase(id, "PASS", "v0.2.0")),
  // 3 misclassified PASS cases (predicted FAIL)
  ...repPassCaseIds.slice(51, 54).map((id) => judgeCase(id, "FAIL", "v0.2.0")),

  // FAIL cases: 3 correct (FAIL), 3 wrong (PASS)
  judgeCase("rep-fail-001", "FAIL", "v0.2.0"), // TP
  judgeCase("rep-fail-002", "FAIL", "v0.2.0"), // TP
  judgeCase("rep-fail-003", "FAIL", "v0.2.0"), // TP
  judgeCase("rep-fail-004", "PASS", "v0.2.0"), // FN ← missed
  judgeCase("rep-fail-005", "PASS", "v0.2.0"), // FN ← missed
  judgeCase("rep-fail-006", "PASS", "v0.2.0"), // FN ← missed

  // Targeted/risk cases (present for completeness, excluded from metrics)
  judgeCase("trg-fail-001", "PASS", "v0.2.0"),
  judgeCase("trg-fail-002", "PASS", "v0.2.0"),
  judgeCase("trg-fail-003", "PASS", "v0.2.0"),
  judgeCase("trg-fail-004", "PASS", "v0.2.0"),
  judgeCase("trg-fail-005", "FAIL", "v0.2.0"),
  judgeCase("trg-fail-006", "FAIL", "v0.2.0"),
  judgeCase("trg-fail-007", "FAIL", "v0.2.0"),
  judgeCase("trg-fail-008", "FAIL", "v0.2.0"),
  judgeCase("trg-pass-001", "PASS", "v0.2.0"),
  judgeCase("trg-pass-002", "PASS", "v0.2.0"),
];

// ── Candidate: improved minority-class behavior ───────────────
// 53 correct PASS, 1 wrong; 5 correct FAIL, 1 wrong
export const candidateJudgments: Judgment[] = [
  // 53 correctly classified PASS cases
  ...repPassCaseIds.slice(0, 53).map((id) =>
    judgeCase(id, "PASS", "v0.3.0-candidate")
  ),
  // 1 misclassified PASS case
  judgeCase(repPassCaseIds[53], "FAIL", "v0.3.0-candidate"),

  // FAIL cases: 5 correct, 1 wrong
  judgeCase("rep-fail-001", "FAIL", "v0.3.0-candidate"), // TP
  judgeCase("rep-fail-002", "FAIL", "v0.3.0-candidate"), // TP
  judgeCase("rep-fail-003", "FAIL", "v0.3.0-candidate"), // TP
  judgeCase("rep-fail-004", "FAIL", "v0.3.0-candidate"), // TP
  judgeCase("rep-fail-005", "FAIL", "v0.3.0-candidate"), // TP
  judgeCase("rep-fail-006", "PASS", "v0.3.0-candidate"), // FN ← one remaining miss
];
