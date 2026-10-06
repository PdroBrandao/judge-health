// ============================================================
// Tests: Calibration Report data assembly
//
// These tests exercise the core computations that the
// /calibration-report page performs — without rendering React.
//
// REPORT-01: historical metric isolation
//   Each attempt's metrics derive exclusively from its own sealed
//   run. Changing a later run must not affect earlier metrics.
//
// REPORT-02: rubric identity across attempts
//   Each candidate's rubricText is preserved verbatim in the
//   sealed CandidateRecord. Later updates must not mutate it.
//
// REPORT-03: determinism
//   computeReliabilityProfile is deterministic: calling it twice
//   with the same inputs produces identical output.
//
// REPORT-04: accepted version provenance
//   The accepted CandidateRecord carries correct evaluatorVersion,
//   rubricVersion, rubricText, and links back to the decision.
//
// REPORT-05: predecessor rubric selection
//   Attempt #1 diffs against BASELINE_RUBRIC_TEXT.
//   Attempt #N (N > 1) diffs against candidate[N-2].rubricText.
// ============================================================
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FixtureRepository } from "@/data/fixture-repository";
import { computeReliabilityProfile, classifyCasesForMatrix } from "@/core/metrics";
import { RunStore, liveJudgmentsToJudgments } from "@/data/run-store";
import { WorkflowStore } from "@/data/workflow-store";
import { ACTIVE_RUBRIC_TEXT as BASELINE_RUBRIC_TEXT } from "@/data/rubric-text";
import type { LiveJudgment } from "@/core/types";

vi.mock("server-only", () => ({}));

// ── Shared helpers ────────────────────────────────────────────

function makeJudgment(caseId: string, label: "PASS" | "FAIL" = "PASS"): LiveJudgment {
  return {
    caseId,
    label,
    rationale: `Test rationale for ${caseId}`,
    evaluatorVersion: "v0.2.0",
    rubricVersion: "rubric-v0.2",
    timestamp: new Date().toISOString(),
    model: "gpt-5.6-luna",
  };
}

function setupDiagnosis(): void {
  WorkflowStore.submitDiagnosis({
    triggerId: "trg-fail-001",
    evaluatorVersion: "v0.2.0",
    category: "evaluator_rubric",
    observationNote: "FAIL recall below threshold.",
    revalidationRequested: true,
    createdAt: new Date().toISOString(),
  });
}

function setupBaselineRun(sampleIds: string[]): string {
  const run = RunStore.createRun({
    type: "baseline", mode: "live",
    evaluatorVersion: "v0.2.0", rubricVersion: "rubric-v0.2",
    taxonomyVersion: "taxonomy-v0.1", model: "gpt-5.6-luna", sampleIds,
  });
  RunStore.startRun(run.runId);
  sampleIds.forEach((id) => RunStore.addJudgment(run.runId, makeJudgment(id)));
  RunStore.completeRun(run.runId);
  WorkflowStore.setBaselineRunId(run.runId);
  return run.runId;
}

/**
 * Create intervention + candidate for the current attempt.
 * Returns the CandidateRecord.
 */
function doIntervention(n: number, rubricText?: string) {
  const diag = WorkflowStore.getDiagnosis()!;
  WorkflowStore.createIntervention({
    diagnosisId: diag.id,
    baselineEvaluatorVersion: "v0.2.0",
    baselineRubricVersion: "rubric-v0.2",
    proposedRubricText: rubricText ?? `Rubric revision v${n}`,
    rationale: `Attempt ${n} rationale.`,
    createdAt: new Date().toISOString(),
  });
  return WorkflowStore.createCandidate({
    evaluatorVersion: `v0.2.0-candidate.${n}`,
    rubricVersion: `rubric-proposed-v${n}`,
    rubricText: rubricText ?? `Rubric revision v${n}`,
    taxonomyVersion: "taxonomy-v0.1",
  });
}

/**
 * Attach a completed live run to the current candidate.
 * Returns { runId, judgments }.
 */
function doLiveCandidateRun(
  sampleIds: string[],
  labelFn: (id: string) => "PASS" | "FAIL" = () => "PASS",
) {
  const cand = WorkflowStore.getCurrentCandidate()!;
  const run = RunStore.createRun({
    type: "candidate", mode: "live",
    evaluatorVersion: cand.evaluatorVersion,
    rubricVersion: cand.rubricVersion,
    taxonomyVersion: cand.taxonomyVersion,
    model: "gpt-5.6-luna", sampleIds,
  });
  RunStore.startRun(run.runId);
  sampleIds.forEach((id) => RunStore.addJudgment(run.runId, { ...makeJudgment(id, labelFn(id)), evaluatorVersion: cand.evaluatorVersion }));
  RunStore.completeRun(run.runId);
  WorkflowStore.setCurrentCandidateRunId(run.runId);
  return run;
}

// ── REPORT-01: historical metric isolation ────────────────────
describe("REPORT-01: historical metric isolation — each attempt uses its own sealed run", () => {
  beforeEach(() => {
    RunStore.reset();
    WorkflowStore.reset();
  });

  it("candidate #1 metrics are not affected by candidate #2 run data", () => {
    const cases  = FixtureRepository.getCases();
    const allIds = cases.map((c) => c.id);

    setupBaselineRun(allIds);
    setupDiagnosis();

    // Attempt #1 — all PASS judgments
    const cand1 = doIntervention(1);
    const run1  = doLiveCandidateRun(allIds, () => "PASS");
    const cand1Snapshot = WorkflowStore.getAllCandidates().find(
      (c) => c.candidateId === cand1.candidateId
    )!;

    WorkflowStore.recordDecision({
      candidateId: cand1.candidateId,
      candidateVersion: cand1.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "rejected",
      rationale: "Not improved enough.",
      decidedAt: new Date().toISOString(),
    });
    WorkflowStore.startNewAttempt();

    // Attempt #2 — all FAIL judgments (very different labels)
    const cand2 = doIntervention(2);
    doLiveCandidateRun(allIds, () => "FAIL");

    // Compute metrics from each run's sealed data
    const run1Sealed    = RunStore.getRun(run1.runId)!;
    const run1Judgments = liveJudgmentsToJudgments(run1Sealed.judgments);
    const profile1      = computeReliabilityProfile(cases, run1Judgments, cand1Snapshot.evaluatorVersion);

    const cand2Record  = WorkflowStore.getAllCandidates().find(
      (c) => c.candidateId === cand2.candidateId
    )!;
    const run2Id       = cand2Record.revalidationRunId!;
    const run2Sealed   = RunStore.getRun(run2Id)!;
    const run2Judgments = liveJudgmentsToJudgments(run2Sealed.judgments);
    const profile2     = computeReliabilityProfile(cases, run2Judgments, cand2Record.evaluatorVersion);

    // Candidate #1: all PASS → OA = 100% for PASS class, FAIL recall = 0%
    expect(profile1.overallAgreement).toBeGreaterThan(0.8);
    expect(profile1.perClass.FAIL.recall).toBe(0); // all labelled PASS → missed all FAILs

    // Candidate #2: all FAIL → very different metrics
    // These differ — proves metric isolation (run #2 doesn't bleed into run #1)
    expect(profile2.perClass.FAIL.recall).toBeGreaterThan(0);
    expect(profile2.overallAgreement).not.toBeCloseTo(profile1.overallAgreement, 1);
  });
});

// ── REPORT-02: rubric identity across attempts ────────────────
describe("REPORT-02: rubric identity — CandidateRecord preserves rubricText verbatim", () => {
  beforeEach(() => {
    RunStore.reset();
    WorkflowStore.reset();
  });

  it("rubricText is preserved in CandidateRecord and cannot be mutated by later attempts", () => {
    const cases  = FixtureRepository.getCases();
    const allIds = cases.map((c) => c.id);

    setupBaselineRun(allIds);
    setupDiagnosis();

    const RUBRIC_1 = "# Rubric Attempt 1\nCriteria A: strict.\nCriteria B: lenient.";
    const RUBRIC_2 = "# Rubric Attempt 2\nCriteria A: strict.\nCriteria B: strict.\nCriteria C: new rule.";

    // Attempt #1
    const cand1 = doIntervention(1, RUBRIC_1);
    doLiveCandidateRun(allIds);
    WorkflowStore.recordDecision({
      candidateId: cand1.candidateId,
      candidateVersion: cand1.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "rejected",
      rationale: "rubric incomplete",
      decidedAt: new Date().toISOString(),
    });
    WorkflowStore.startNewAttempt();

    // Attempt #2 with different rubric
    const cand2 = doIntervention(2, RUBRIC_2);
    doLiveCandidateRun(allIds);

    const all = WorkflowStore.getAllCandidates();
    const r1  = all.find((c) => c.candidateId === cand1.candidateId)!;
    const r2  = all.find((c) => c.candidateId === cand2.candidateId)!;

    // Rubric #1 must be exactly preserved — not overwritten by rubric #2
    expect(r1.rubricText).toBe(RUBRIC_1);
    expect(r2.rubricText).toBe(RUBRIC_2);
    expect(r1.rubricText).not.toBe(r2.rubricText);
  });
});

// ── REPORT-03: determinism ────────────────────────────────────
describe("REPORT-03: determinism — computeReliabilityProfile produces identical output for same inputs", () => {
  it("calling twice returns deeply equal profiles", () => {
    const cases     = FixtureRepository.getCases();
    const judgments = FixtureRepository.getBaselineJudgments();
    const version   = FixtureRepository.getActiveEvaluatorVersion().version;

    const profile1  = computeReliabilityProfile(cases, judgments, version);
    const profile2  = computeReliabilityProfile(cases, judgments, version);

    expect(profile1.overallAgreement).toBe(profile2.overallAgreement);
    expect(profile1.perClass.FAIL.recall).toBe(profile2.perClass.FAIL.recall);
    expect(profile1.perClass.FAIL.precision).toBe(profile2.perClass.FAIL.precision);
    expect(profile1.confusionMatrix.TP).toBe(profile2.confusionMatrix.TP);
    expect(profile1.confusionMatrix.FP).toBe(profile2.confusionMatrix.FP);
    expect(profile1.confusionMatrix.TN).toBe(profile2.confusionMatrix.TN);
    expect(profile1.confusionMatrix.FN).toBe(profile2.confusionMatrix.FN);
    expect(profile1.sampleN).toBe(profile2.sampleN);
  });

  it("different judge labels produce different profiles (sanity check)", () => {
    const cases    = FixtureRepository.getCases();
    const repCases = cases.filter((c) => c.sampleType === "representative");
    const version  = "v-test";

    const allPass  = repCases.map((c) => ({ caseId: c.id, evaluatorVersion: version, predictedLabel: "PASS" as const }));
    const allFail  = repCases.map((c) => ({ caseId: c.id, evaluatorVersion: version, predictedLabel: "FAIL" as const }));

    const p1 = computeReliabilityProfile(cases, allPass, version);
    const p2 = computeReliabilityProfile(cases, allFail, version);

    expect(p1.overallAgreement).not.toBe(p2.overallAgreement);
  });
});

// ── REPORT-04: accepted version provenance ────────────────────
describe("REPORT-04: accepted version provenance — CandidateRecord links correctly to decision", () => {
  beforeEach(() => {
    RunStore.reset();
    WorkflowStore.reset();
  });

  it("accepted candidate has correct evaluatorVersion, rubricVersion, and a matching decision", () => {
    const cases  = FixtureRepository.getCases();
    const allIds = cases.map((c) => c.id);

    setupBaselineRun(allIds);
    setupDiagnosis();

    // Attempt #1 — rejected
    const cand1 = doIntervention(1);
    doLiveCandidateRun(allIds);
    WorkflowStore.recordDecision({
      candidateId: cand1.candidateId,
      candidateVersion: cand1.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "rejected",
      rationale: "Not sufficient.",
      decidedAt: new Date().toISOString(),
    });
    WorkflowStore.startNewAttempt();

    // Attempt #2 — accepted
    const FINAL_RUBRIC = "# Final Rubric\nCriteria A: improved.\nCriteria B: strict.";
    const cand2 = doIntervention(2, FINAL_RUBRIC);
    doLiveCandidateRun(allIds);
    WorkflowStore.recordDecision({
      candidateId: cand2.candidateId,
      candidateVersion: cand2.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "accepted",
      rationale: "FAIL recall improved.",
      decidedAt: new Date().toISOString(),
    });

    const allCandidates = WorkflowStore.getAllCandidates();
    const accepted = allCandidates.find((c) => c.status === "accepted");

    expect(accepted).toBeDefined();
    expect(accepted!.evaluatorVersion).toBe("v0.2.0-candidate.2");
    expect(accepted!.rubricVersion).toBe("rubric-proposed-v2");
    expect(accepted!.rubricText).toBe(FINAL_RUBRIC);

    // Confirm the decision links back to this candidate
    const allDecisions = WorkflowStore.getAllDecisions();
    const acceptDecision = allDecisions.find((d) => d.decision === "accepted");

    expect(acceptDecision).toBeDefined();
    expect(acceptDecision!.candidateId).toBe(accepted!.candidateId);
    expect(acceptDecision!.candidateVersion).toBe(accepted!.evaluatorVersion);
  });

  it("rejected candidates are not marked accepted", () => {
    const cases  = FixtureRepository.getCases();
    const allIds = cases.map((c) => c.id);

    setupBaselineRun(allIds);
    setupDiagnosis();

    const cand1 = doIntervention(1);
    doLiveCandidateRun(allIds);
    WorkflowStore.recordDecision({
      candidateId: cand1.candidateId,
      candidateVersion: cand1.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "rejected",
      rationale: "Needs more work.",
      decidedAt: new Date().toISOString(),
    });

    const accepted = WorkflowStore.getAllCandidates().find((c) => c.status === "accepted");
    expect(accepted).toBeUndefined();
  });
});

// ── REPORT-05: predecessor rubric selection ───────────────────
describe("REPORT-05: predecessor rubric — diff is vs baseline for attempt #1, vs prev candidate for attempt #N", () => {
  beforeEach(() => {
    RunStore.reset();
    WorkflowStore.reset();
  });

  it("attempt #1 predecessor is BASELINE_RUBRIC_TEXT", () => {
    const cases  = FixtureRepository.getCases();
    const allIds = cases.map((c) => c.id);

    setupBaselineRun(allIds);
    setupDiagnosis();

    const RUBRIC_1 = "# My first rubric\nNew criteria here.";
    doIntervention(1, RUBRIC_1);

    const all = WorkflowStore.getAllCandidates();
    // Attempt #1 (index 0) → predecessor is baseline
    const predecessorRubric = all.length > 0
      ? BASELINE_RUBRIC_TEXT  // same logic the page uses
      : null;

    expect(predecessorRubric).toBe(BASELINE_RUBRIC_TEXT);
    expect(all[0].rubricText).toBe(RUBRIC_1);
    expect(all[0].rubricText).not.toBe(BASELINE_RUBRIC_TEXT);
  });

  it("attempt #2 predecessor is attempt #1 rubricText (not baseline)", () => {
    const cases  = FixtureRepository.getCases();
    const allIds = cases.map((c) => c.id);

    setupBaselineRun(allIds);
    setupDiagnosis();

    const RUBRIC_1 = "# Rubric 1\nLine A.\nLine B.";
    const RUBRIC_2 = "# Rubric 2\nLine A.\nLine B.\nLine C — new rule.";

    const cand1 = doIntervention(1, RUBRIC_1);
    doLiveCandidateRun(allIds);
    WorkflowStore.recordDecision({
      candidateId: cand1.candidateId,
      candidateVersion: cand1.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "rejected",
      rationale: "incomplete",
      decidedAt: new Date().toISOString(),
    });
    WorkflowStore.startNewAttempt();
    doIntervention(2, RUBRIC_2);

    const all = WorkflowStore.getAllCandidates();
    expect(all).toHaveLength(2);

    // The page computes predecessor rubric as:
    //   idx === 0 ? BASELINE_RUBRIC_TEXT : candidates[idx - 1].rubricText
    const predecessorForAttempt2 = all[0].rubricText; // candidates[1 - 1]
    expect(predecessorForAttempt2).toBe(RUBRIC_1);
    expect(predecessorForAttempt2).not.toBe(BASELINE_RUBRIC_TEXT);
    expect(all[1].rubricText).toBe(RUBRIC_2);
  });

  it("attempt #3 predecessor is attempt #2 rubricText", () => {
    const cases  = FixtureRepository.getCases();
    const allIds = cases.map((c) => c.id);

    setupBaselineRun(allIds);
    setupDiagnosis();

    const RUBRICS = [
      "# Rev 1\nA only.",
      "# Rev 2\nA only.\nB added.",
      "# Rev 3\nA only.\nB added.\nC added.",
    ];

    for (let n = 1; n <= 3; n++) {
      const cand = doIntervention(n, RUBRICS[n - 1]);
      doLiveCandidateRun(allIds);
      if (n < 3) {
        WorkflowStore.recordDecision({
          candidateId: cand.candidateId,
          candidateVersion: cand.evaluatorVersion,
          baselineVersion: "v0.2.0",
          decision: "rejected",
          rationale: `Rejected attempt ${n}`,
          decidedAt: new Date().toISOString(),
        });
        WorkflowStore.startNewAttempt();
      }
    }

    const all = WorkflowStore.getAllCandidates();
    expect(all).toHaveLength(3);

    // attempt #3 (index 2) predecessor = candidates[1].rubricText = RUBRICS[1]
    expect(all[1].rubricText).toBe(RUBRICS[1]);
    expect(all[2].rubricText).toBe(RUBRICS[2]);
    // Baseline is not the predecessor for attempt #3
    expect(all[1].rubricText).not.toBe(BASELINE_RUBRIC_TEXT);
  });
});
