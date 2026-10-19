// ============================================================
// Evaluation summary — representative metrics, targeted/risk
// separation, zero denominators, and run-scoped decisions.
// ============================================================
import { describe, it, expect } from "vitest";
import type { EvaluationCase, Judgment, RevalidationDecision } from "@/core/types";
import {
  buildEvaluationSummary,
  formatCountRatio,
  formatDefinedPct,
  recordedDecisionForRun,
} from "@/app/evidence/evaluation-summary";

function repCase(id: string, groundTruth: "PASS" | "FAIL"): EvaluationCase {
  return { id, groundTruth, sampleType: "representative" };
}

function trgCase(id: string, groundTruth: "PASS" | "FAIL"): EvaluationCase {
  return { id, groundTruth, sampleType: "targeted_risk" };
}

function judge(caseId: string, predictedLabel: "PASS" | "FAIL"): Judgment {
  return { caseId, evaluatorVersion: "v-test", predictedLabel };
}

function decision(
  partial: Partial<RevalidationDecision> & Pick<RevalidationDecision, "candidateId" | "decision">,
): RevalidationDecision {
  return {
    id: "dec-1",
    candidateVersion: "v-candidate",
    baselineVersion: "v-baseline",
    rationale: "Recorded rationale.",
    decidedAt: "2026-10-07T00:00:00.000Z",
    ...partial,
  };
}

// Representative: 54 PASS + 6 FAIL. Targeted: 8 FAIL + 2 PASS.
// Candidate pattern: 59/60 representative agreement, one targeted FAIL missed.
function candidateEightFixture() {
  const repPass = Array.from({ length: 54 }, (_, i) => repCase(`rep-${String(i + 1).padStart(3, "0")}`, "PASS"));
  const repFail = Array.from({ length: 6 }, (_, i) => repCase(`rep-fail-${String(i + 1).padStart(3, "0")}`, "FAIL"));
  const trgFail = Array.from({ length: 8 }, (_, i) => trgCase(`trg-fail-${String(i + 1).padStart(3, "0")}`, "FAIL"));
  const trgPass = Array.from({ length: 2 }, (_, i) => trgCase(`trg-pass-${String(i + 1).padStart(3, "0")}`, "PASS"));
  const cases = [...repPass, ...repFail, ...trgFail, ...trgPass];

  const judgments: Judgment[] = [
    ...repFail.map((c) => judge(c.id, "FAIL")),
    ...repPass.slice(0, 53).map((c) => judge(c.id, "PASS")),
    judge(repPass[53].id, "FAIL"),
    ...trgFail.filter((c) => c.id !== "trg-fail-002").map((c) => judge(c.id, "FAIL")),
    judge("trg-fail-002", "PASS"),
    ...trgPass.map((c) => judge(c.id, "PASS")),
  ];

  return { cases, judgments };
}

describe("buildEvaluationSummary — candidate attempt #8 pattern", () => {
  const { cases, judgments } = candidateEightFixture();
  const rejected = decision({
    candidateId: "cand-8",
    decision: "rejected",
    rationale: "Rejected despite 98.3% agreement because trg-fail-002 was missed.",
  });
  const summary = buildEvaluationSummary({
    cases,
    judgments,
    evaluatorVersion: "v0.2.0-candidate.8",
    recordedDecision: rejected,
  });

  it("reports 59/60 overall agreement on the representative sample only", () => {
    expect(summary.representative.correct).toBe(59);
    expect(summary.representative.sampleN).toBe(60);
    expect(summary.representative.overallAgreement).toBeCloseTo(59 / 60, 5);
    expect(summary.representative.agreementDefined).toBe(true);
  });

  it("keeps FAIL recall and precision on the representative confusion matrix", () => {
    expect(summary.representative.failRecall).toBe(1);
    expect(summary.representative.failRecallHits).toBe(6);
    expect(summary.representative.failRecallSupport).toBe(6);
    expect(summary.representative.failPrecision).toBeCloseTo(6 / 7, 5);
    expect(summary.representative.fp).toBe(1);
    expect(summary.representative.fn).toBe(0);
  });

  it("does not fold the targeted miss into representative agreement or FN", () => {
    expect(summary.representative.fnCaseIds).toEqual([]);
    expect(summary.representative.overallAgreement).toBeCloseTo(59 / 60, 5);
    expect(summary.targeted.missedFailIds).toEqual(["trg-fail-002"]);
    expect(summary.targeted.failDetected).toBe(7);
    expect(summary.targeted.failSupport).toBe(8);
    expect(summary.targeted.fn).toBe(1);
    expect(summary.targeted.fp).toBe(0);
  });

  it("keeps a recorded rejection even when aggregate agreement is high", () => {
    expect(summary.representative.overallAgreement).toBeGreaterThan(0.98);
    expect(summary.recordedDecision?.decision).toBe("rejected");
    expect(summary.recordedDecision?.decision).not.toBe("accepted");
  });
});

describe("buildEvaluationSummary — baseline uses the same reference labels", () => {
  const { cases } = candidateEightFixture();
  // Every representative PASS is predicted FAIL except two.
  // Every FAIL is predicted FAIL. Targeted PASS cases are predicted FAIL.
  const judgments: Judgment[] = [
    ...cases.filter((c) => c.sampleType === "representative" && c.groundTruth === "FAIL").map((c) => judge(c.id, "FAIL")),
    ...cases.filter((c) => c.sampleType === "representative" && c.groundTruth === "PASS").slice(0, 2).map((c) => judge(c.id, "PASS")),
    ...cases.filter((c) => c.sampleType === "representative" && c.groundTruth === "PASS").slice(2).map((c) => judge(c.id, "FAIL")),
    ...cases.filter((c) => c.sampleType === "targeted_risk" && c.groundTruth === "FAIL").map((c) => judge(c.id, "FAIL")),
    ...cases.filter((c) => c.sampleType === "targeted_risk" && c.groundTruth === "PASS").map((c) => judge(c.id, "FAIL")),
  ];

  const summary = buildEvaluationSummary({
    cases,
    judgments,
    evaluatorVersion: "v0.2.0",
    recordedDecision: null,
  });

  it("computes baseline metrics against the same labels, without a decision", () => {
    expect(summary.representative.correct).toBe(8); // 6 FAIL + 2 PASS
    expect(summary.representative.sampleN).toBe(60);
    expect(summary.representative.overallAgreement).toBeCloseTo(8 / 60, 5);
    expect(summary.representative.failRecall).toBe(1);
    expect(summary.representative.fp).toBe(52);
    expect(summary.representative.fn).toBe(0);
    expect(summary.targeted.failDetected).toBe(8);
    expect(summary.targeted.missedFailIds).toEqual([]);
    expect(summary.targeted.fp).toBe(2);
    expect(summary.recordedDecision).toBeNull();
  });

  it("differs from the candidate summary on the same reference set", () => {
    const { judgments: candidateJudgments } = candidateEightFixture();
    const candidate = buildEvaluationSummary({
      cases,
      judgments: candidateJudgments,
      evaluatorVersion: "v-candidate",
    });
    expect(candidate.representative.overallAgreement).not.toBeCloseTo(
      summary.representative.overallAgreement,
      2,
    );
    expect(candidate.targeted.missedFailIds).not.toEqual(summary.targeted.missedFailIds);
  });
});

describe("buildEvaluationSummary — zero denominators", () => {
  it("leaves agreement undefined when the representative sample is empty", () => {
    const summary = buildEvaluationSummary({
      cases: [],
      judgments: [],
      evaluatorVersion: "v-empty",
    });
    expect(summary.representative.agreementDefined).toBe(false);
    expect(summary.representative.overallAgreement).toBe(0);
    expect(summary.representative.failRecallDefined).toBe(false);
    expect(summary.representative.failRecall).toBe(0);
    expect(summary.representative.failPrecisionDefined).toBe(false);
    expect(summary.representative.failPrecision).toBe(0);
    expect(summary.targeted.failDetectionDefined).toBe(false);
    expect(formatDefinedPct(false, 0)).toBe("—");
    expect(formatCountRatio(0, 0)).toBe("—");
  });

  it("leaves FAIL recall undefined when no reference FAIL was judged", () => {
    const summary = buildEvaluationSummary({
      cases: [repCase("rep-1", "PASS"), trgCase("trg-pass-1", "PASS")],
      judgments: [judge("rep-1", "PASS"), judge("trg-pass-1", "PASS")],
      evaluatorVersion: "v-pass-only",
    });
    expect(summary.representative.failRecallDefined).toBe(false);
    expect(summary.representative.failRecall).toBe(0);
    expect(summary.representative.failPrecisionDefined).toBe(false);
    expect(summary.representative.overallAgreement).toBe(1);
    expect(summary.targeted.failSupport).toBe(0);
    expect(summary.targeted.failDetectionDefined).toBe(false);
  });

  it("leaves FAIL precision undefined when the evaluator predicts no FAIL", () => {
    const summary = buildEvaluationSummary({
      cases: [repCase("rep-fail-1", "FAIL"), repCase("rep-1", "PASS")],
      judgments: [judge("rep-fail-1", "PASS"), judge("rep-1", "PASS")],
      evaluatorVersion: "v-all-pass",
    });
    expect(summary.representative.failRecallDefined).toBe(true);
    expect(summary.representative.failRecall).toBe(0);
    expect(summary.representative.fn).toBe(1);
    expect(summary.representative.failPrecisionDefined).toBe(false);
    expect(summary.representative.failPrecision).toBe(0);
    expect(formatCountRatio(0, 0)).toBe("—");
    expect(formatDefinedPct(true, 0)).toBe("0.0%");
  });

  it("does not count an unjudged targeted FAIL as a confirmed miss", () => {
    const summary = buildEvaluationSummary({
      cases: [repCase("rep-1", "PASS"), trgCase("trg-fail-002", "FAIL")],
      judgments: [judge("rep-1", "PASS")],
      evaluatorVersion: "v-partial",
    });
    expect(summary.targeted.missedFailIds).toEqual([]);
    expect(summary.targeted.unevaluatedFailIds).toEqual(["trg-fail-002"]);
    expect(summary.targeted.failDetected).toBe(0);
    expect(summary.targeted.failSupport).toBe(1);
    expect(summary.representative.sampleN).toBe(1);
    expect(summary.representative.overallAgreement).toBe(1);
  });
});

describe("recordedDecisionForRun — selection does not invent a status", () => {
  const candidates = [
    { candidateId: "cand-8", revalidationRunId: "run-8" },
    { candidateId: "cand-12", revalidationRunId: "run-12" },
    { candidateId: "cand-open", revalidationRunId: "run-open" },
  ];
  const decisions = [
    decision({ candidateId: "cand-8", decision: "rejected" }),
    decision({ candidateId: "cand-12", decision: "accepted", id: "dec-12" }),
  ];

  it("returns the rejection stored for the selected candidate run", () => {
    expect(recordedDecisionForRun("run-8", candidates, decisions)?.decision).toBe("rejected");
  });

  it("returns the acceptance stored for a different selected run", () => {
    expect(recordedDecisionForRun("run-12", candidates, decisions)?.decision).toBe("accepted");
  });

  it("returns null for the baseline run", () => {
    expect(recordedDecisionForRun("run-baseline", candidates, decisions)).toBeNull();
  });

  it("returns null when the selected candidate has no recorded decision", () => {
    expect(recordedDecisionForRun("run-open", candidates, decisions)).toBeNull();
  });

  it("returns null when nothing is selected", () => {
    expect(recordedDecisionForRun(null, candidates, decisions)).toBeNull();
  });

  it("does not promote a high-agreement run that has no decision", () => {
    const { cases, judgments } = candidateEightFixture();
    const summary = buildEvaluationSummary({
      cases,
      judgments,
      evaluatorVersion: "v-undecided",
      recordedDecision: recordedDecisionForRun("run-open", candidates, decisions),
    });
    expect(summary.representative.overallAgreement).toBeCloseTo(59 / 60, 5);
    expect(summary.targeted.missedFailIds).toEqual(["trg-fail-002"]);
    expect(summary.recordedDecision).toBeNull();
  });
});
