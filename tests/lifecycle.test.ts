// ============================================================
// Tests: end-to-end lifecycle (fixture-based integration)
// Validates the full path: fixture → validated repo → metrics → triggers
// ============================================================
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FixtureRepository } from "@/data/fixture-repository";
import { computeReliabilityProfile } from "@/core/metrics";
import { describeSamplingPlan, getRepresentativeSample } from "@/core/sampling";
import { evaluateAllTriggers } from "@/core/triggers";
import { RunStore, liveJudgmentsToJudgments } from "@/data/run-store";
import { WorkflowStore } from "@/data/workflow-store";
import type { LiveJudgment } from "@/core/types";

vi.mock("server-only", () => ({}));

describe("Fixture Repository (Zod validation)", () => {
  it("loads and validates cases without throwing", () => {
    expect(() => FixtureRepository.getCases()).not.toThrow();
  });

  it("loads and validates baseline judgments without throwing", () => {
    expect(() => FixtureRepository.getBaselineJudgments()).not.toThrow();
  });

  it("loads and validates trigger configs without throwing", () => {
    expect(() => FixtureRepository.getTriggerConfigs()).not.toThrow();
  });

  it("returns 70 total cases (60 representative + 10 targeted_risk)", () => {
    const cases = FixtureRepository.getCases();
    expect(cases).toHaveLength(70);
  });

  it("representative sample has exactly 60 cases", () => {
    const cases = FixtureRepository.getCases();
    const rep = getRepresentativeSample(cases);
    expect(rep).toHaveLength(60);
  });

  it("representative sample has 54 PASS and 6 FAIL", () => {
    const cases = FixtureRepository.getCases();
    const rep = getRepresentativeSample(cases);
    const pass = rep.filter((c) => c.groundTruth === "PASS").length;
    const fail = rep.filter((c) => c.groundTruth === "FAIL").length;
    expect(pass).toBe(54);
    expect(fail).toBe(6);
  });
});

describe("End-to-end: baseline evaluator reliability profile", () => {
  const cases = FixtureRepository.getCases();
  const judgments = FixtureRepository.getBaselineJudgments();
  const active = FixtureRepository.getActiveEvaluatorVersion();
  const profile = computeReliabilityProfile(cases, judgments, active.version);

  it("overall agreement is 90%", () => {
    expect(profile.overallAgreement).toBeCloseTo(0.9, 5);
  });

  it("FAIL recall is 50% (3/6) — the minority-class gap", () => {
    expect(profile.perClass.FAIL.recall).toBeCloseTo(0.5, 5);
  });

  it("PASS recall is ~94.4% (51/54)", () => {
    expect(profile.perClass.PASS.recall).toBeCloseTo(51 / 54, 5);
  });

  it("90% overall hides 50% FAIL recall (key insight)", () => {
    // The reason Judge Health exists: headline metric misleads
    expect(profile.overallAgreement).toBeGreaterThan(0.85);
    expect(profile.perClass.FAIL.recall).toBeLessThan(0.6);
    const gap = profile.overallAgreement - profile.perClass.FAIL.recall;
    expect(gap).toBeGreaterThan(0.35);
  });

  it("FAIL class recall CI is wider than PASS (small n=6 vs n=54)", () => {
    const fw = profile.perClass.FAIL.recallCI.upper - profile.perClass.FAIL.recallCI.lower;
    const pw = profile.perClass.PASS.recallCI.upper - profile.perClass.PASS.recallCI.lower;
    expect(fw).toBeGreaterThan(pw);
  });
});

describe("End-to-end: candidate evaluator improvement", () => {
  const cases = FixtureRepository.getCases();
  const judgments = FixtureRepository.getCandidateJudgments();
  const profile = computeReliabilityProfile(cases, judgments, "v0.3.0-candidate");

  it("candidate overall agreement > 95%", () => {
    expect(profile.overallAgreement).toBeGreaterThan(0.95);
  });

  it("candidate FAIL recall > 80%", () => {
    expect(profile.perClass.FAIL.recall).toBeGreaterThan(0.80);
  });

  it("candidate FAIL recall > baseline FAIL recall", () => {
    const baseJudgments = FixtureRepository.getBaselineJudgments();
    const baseProfile = computeReliabilityProfile(
      cases,
      baseJudgments,
      FixtureRepository.getActiveEvaluatorVersion().version
    );
    expect(profile.perClass.FAIL.recall).toBeGreaterThan(
      baseProfile.perClass.FAIL.recall
    );
  });
});

describe("End-to-end: triggers on baseline profile", () => {
  const cases = FixtureRepository.getCases();
  const judgments = FixtureRepository.getBaselineJudgments();
  const active = FixtureRepository.getActiveEvaluatorVersion();
  const profile = computeReliabilityProfile(cases, judgments, active.version);
  const triggers = FixtureRepository.getTriggerConfigs();
  const current = FixtureRepository.getCurrentConfiguration();
  const baseline = FixtureRepository.getBaselineConfiguration();

  const results = evaluateAllTriggers(triggers, profile, current, baseline);

  it("fail_recall trigger fires (50% < 70%)", () => {
    const t = results.find(
      (r) => r.config.type === "metric" && (r.config as { metric: string }).metric === "fail_recall"
    );
    expect(t).toBeDefined();
    expect(t!.fired).toBe(true);
  });

  it("overall_agreement trigger does NOT fire (90% > 80%)", () => {
    const t = results.find(
      (r) =>
        r.config.type === "metric" &&
        (r.config as { metric: string }).metric === "overall_agreement"
    );
    expect(t).toBeDefined();
    expect(t!.fired).toBe(false);
  });

  it("change triggers do not fire when config is identical", () => {
    const changeTriggers = results.filter((r) => r.config.type === "change");
    expect(changeTriggers.every((r) => !r.fired)).toBe(true);
  });
});

describe("End-to-end: sampling plan", () => {
  it("stratification note documents the separation", () => {
    const cases = FixtureRepository.getCases();
    const plan = describeSamplingPlan(cases);
    expect(plan.stratificationNote).toMatch(/not for population/i);
    expect(plan.representativeN).toBe(60);
    expect(plan.targetedRiskN).toBe(10);
  });
});

// ── Helpers for lifecycle tests ───────────────────────────────
function makeJudgment(caseId: string, label: "PASS" | "FAIL" = "PASS"): LiveJudgment {
  return {
    caseId,
    label,
    rationale: "lifecycle test judgment",
    model: "gpt-5.6-luna",
    evaluatorVersion: "v0.2.0",
    rubricVersion: "rubric-v0.2",
    timestamp: new Date().toISOString(),
    usageTokens: 100,
  };
}

function setupDiagnosis() {
  return WorkflowStore.submitDiagnosis({
    triggerId: "trg-fail-001",
    evaluatorVersion: "v0.2.0",
    category: "evaluator_rubric",
    observationNote: "FAIL recall below threshold.",
    revalidationRequested: true,
    createdAt: new Date().toISOString(),
  });
}

function setupBaselineRun(sampleIds: string[]) {
  const run = RunStore.createRun({
    type: "baseline", mode: "live",
    evaluatorVersion: "v0.2.0", rubricVersion: "rubric-v0.2",
    taxonomyVersion: "taxonomy-v0.1", model: "gpt-5.6-luna", sampleIds,
  });
  RunStore.startRun(run.runId);
  sampleIds.forEach((id) => RunStore.addJudgment(run.runId, makeJudgment(id)));
  RunStore.completeRun(run.runId);
  WorkflowStore.setBaselineRunId(run.runId);
  return run;
}

/**
 * Create intervention + candidate for the current attempt.
 * Returns the CandidateRecord.
 */
function doIntervention(n: number) {
  const diag = WorkflowStore.getDiagnosis()!;
  WorkflowStore.createIntervention({
    diagnosisId: diag.id,
    baselineEvaluatorVersion: "v0.2.0",
    baselineRubricVersion: "rubric-v0.2",
    proposedRubricText: `Updated rubric v${n}`,
    rationale: `Attempt ${n} at improving FAIL recall.`,
    createdAt: new Date().toISOString(),
  });
  return WorkflowStore.createCandidate({
    evaluatorVersion: `v0.2.0-candidate.attempt${n}`,
    rubricVersion: `rubric-v0.2-proposed-${n}`,
    rubricText: `Updated rubric v${n}`,
    taxonomyVersion: "taxonomy-v0.1",
  });
}

/**
 * Attach a live run to the current candidate.
 * Returns the run.
 */
function doLiveCandidateRun(candidateId: string, sampleIds: string[], label: "PASS" | "FAIL" = "PASS") {
  const cand = WorkflowStore.getCurrentCandidate()!;
  const run = RunStore.createRun({
    type: "candidate", mode: "live",
    evaluatorVersion: cand.evaluatorVersion,
    rubricVersion: cand.rubricVersion,
    taxonomyVersion: cand.taxonomyVersion,
    model: "gpt-5.6-luna", sampleIds,
  });
  RunStore.startRun(run.runId);
  sampleIds.forEach((id) => RunStore.addJudgment(run.runId, makeJudgment(id, label)));
  RunStore.completeRun(run.runId);
  WorkflowStore.setCurrentCandidateRunId(run.runId);
  return run;
}

// ─────────────────────────────────────────────────────────────
// LIFE-01: Full rejection cycle — new candidate shows NOT YET EVALUATED
//
// Scenario: baseline → diagnosis → intervention #1 → candidate #1 →
//   live run → reject → startNewAttempt → intervention #2 → candidate #2
//   (no run for #2 yet)
// Assert: ID-scoped lookup returns undefined for candidate #2.
// ─────────────────────────────────────────────────────────────
describe("LIFE-01: full rejection cycle — candidate #2 shows NOT YET EVALUATED", () => {
  beforeEach(() => {
    RunStore.reset();
    WorkflowStore.reset();
  });

  it("candidateRunId is null and ID-scoped lookup is undefined for candidate #2", () => {
    const cases  = FixtureRepository.getCases();
    const allIds = cases.map((c) => c.id);

    // Phase 1: Baseline
    setupBaselineRun(allIds);

    // Phase 2: Candidate #1 + run + reject
    setupDiagnosis();
    const cand1 = doIntervention(1);
    const run1  = doLiveCandidateRun(cand1.candidateId, allIds, "FAIL");

    WorkflowStore.recordDecision({
      candidateId: cand1.candidateId,
      candidateVersion: cand1.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "rejected",
      rationale: "FAIL recall regressed.",
      decidedAt: new Date().toISOString(),
    });

    // Phase 3: Start next attempt (preserves all history)
    WorkflowStore.startNewAttempt();

    // Phase 4: Candidate #2 — NO run yet
    const cand2 = doIntervention(2);

    // Revalidation page logic (ID-scoped lookup)
    const candidateRunId   = WorkflowStore.getCurrentCandidateRunId();
    const liveCandidateRun = candidateRunId ? RunStore.getRun(candidateRunId) : undefined;

    expect(candidateRunId).toBeNull();
    expect(liveCandidateRun).toBeUndefined();

    const candidateIsLive =
      liveCandidateRun?.mode === "live" &&
      (liveCandidateRun.status === "completed" || liveCandidateRun.status === "partial_failure");
    expect(candidateIsLive).toBe(false);

    // Profile is null → "NOT YET EVALUATED" state
    const candidateProfile = candidateIsLive ? "would_exist" : null;
    expect(candidateProfile).toBeNull();

    // Baseline still accessible and unchanged
    const baselineRunId   = WorkflowStore.getBaselineRunId();
    const liveBaselineRun = baselineRunId ? RunStore.getRun(baselineRunId) : undefined;
    expect(liveBaselineRun).toBeDefined();
    expect(liveBaselineRun!.judgments).toHaveLength(allIds.length);

    // Old candidate run #1 still preserved in RunStore (historical record intact)
    expect(RunStore.getRun(run1.runId)).toBeDefined();
    expect(RunStore.getRun(run1.runId)!.status).toBe("completed");

    // Both candidates tracked in store
    expect(WorkflowStore.getAllCandidates()).toHaveLength(2);
    expect(WorkflowStore.getAllCandidates()[0].candidateId).toBe(cand1.candidateId);
    expect(WorkflowStore.getAllCandidates()[1].candidateId).toBe(cand2.candidateId);
  });
});

// ─────────────────────────────────────────────────────────────
// LIFE-02: completeRun idempotency
// ─────────────────────────────────────────────────────────────
describe("LIFE-02: completeRun is idempotent", () => {
  beforeEach(() => {
    RunStore.reset();
    WorkflowStore.reset();
  });

  it("calling completeRun twice returns the same sealed run without throwing", () => {
    const run = RunStore.createRun({
      type: "baseline", mode: "live",
      evaluatorVersion: "v0.2.0", rubricVersion: "rubric-v0.2",
      taxonomyVersion: "taxonomy-v0.1", model: "gpt-5.6-luna", sampleIds: ["rep-001"],
    });
    RunStore.startRun(run.runId);
    RunStore.addJudgment(run.runId, makeJudgment("rep-001"));

    const first  = RunStore.completeRun(run.runId);
    const second = RunStore.completeRun(run.runId); // idempotent — must not throw

    expect(first.status).toBe("completed");
    expect(second.status).toBe("completed");
    expect(second.runId).toBe(first.runId);
    // completedAt must not change between calls
    expect(second.completedAt).toBe(first.completedAt);
  });

  it("judgments are not mutated after second completeRun", () => {
    const run = RunStore.createRun({
      type: "candidate", mode: "live",
      evaluatorVersion: "v0.2.0-candidate", rubricVersion: "rubric-v0.2-p",
      taxonomyVersion: "taxonomy-v0.1", model: "gpt-5.6-luna", sampleIds: ["rep-001"],
    });
    RunStore.startRun(run.runId);
    RunStore.addJudgment(run.runId, makeJudgment("rep-001"));
    RunStore.completeRun(run.runId);
    RunStore.completeRun(run.runId); // second call

    expect(RunStore.getRun(run.runId)!.judgments).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────
// LIFE-03: resolveError throws on sealed run
// ─────────────────────────────────────────────────────────────
describe("LIFE-03: resolveError throws on sealed run", () => {
  beforeEach(() => {
    RunStore.reset();
    WorkflowStore.reset();
  });

  it("resolveError after completeRun throws with sealed message", () => {
    const run = RunStore.createRun({
      type: "baseline", mode: "live",
      evaluatorVersion: "v0.2.0", rubricVersion: "rubric-v0.2",
      taxonomyVersion: "taxonomy-v0.1", model: "gpt-5.6-luna", sampleIds: ["rep-001"],
    });
    RunStore.startRun(run.runId);
    RunStore.addJudgment(run.runId, makeJudgment("rep-001"));
    RunStore.completeRun(run.runId);

    expect(() =>
      RunStore.resolveError(run.runId, "rep-001", makeJudgment("rep-001"))
    ).toThrow(/sealed/i);
  });

  it("addJudgment also throws on sealed run (existing invariant still holds)", () => {
    const run = RunStore.createRun({
      type: "baseline", mode: "live",
      evaluatorVersion: "v0.2.0", rubricVersion: "rubric-v0.2",
      taxonomyVersion: "taxonomy-v0.1", model: "gpt-5.6-luna", sampleIds: ["rep-001"],
    });
    RunStore.startRun(run.runId);
    RunStore.addJudgment(run.runId, makeJudgment("rep-001"));
    RunStore.completeRun(run.runId);

    expect(() =>
      RunStore.addJudgment(run.runId, makeJudgment("rep-002"))
    ).toThrow(/sealed/i);
  });

  it("resolveError before completeRun succeeds (correct retry path)", () => {
    const run = RunStore.createRun({
      type: "candidate", mode: "live",
      evaluatorVersion: "v0.2.0-candidate", rubricVersion: "rubric-v0.2-p",
      taxonomyVersion: "taxonomy-v0.1", model: "gpt-5.6-luna", sampleIds: ["rep-001"],
    });
    RunStore.startRun(run.runId);
    RunStore.addError(run.runId, { caseId: "rep-001", error: "timeout", timestamp: new Date().toISOString() });

    expect(() =>
      RunStore.resolveError(run.runId, "rep-001", makeJudgment("rep-001"))
    ).not.toThrow();

    const updated = RunStore.getRun(run.runId)!;
    expect(updated.errors).toHaveLength(0);
    expect(updated.judgments).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────
// LIFE-04: startNewAttempt preserves full history
//
// After reject #1 + startNewAttempt(), the append-only arrays
// must still contain all historical records.
// ─────────────────────────────────────────────────────────────
describe("LIFE-04: startNewAttempt preserves full history", () => {
  beforeEach(() => {
    RunStore.reset();
    WorkflowStore.reset();
  });

  it("interventions[], candidates[], decisions[] all preserved after startNewAttempt", () => {
    const allIds = FixtureRepository.getCases().map((c) => c.id);
    setupBaselineRun(allIds);
    setupDiagnosis();

    // Attempt #1
    const cand1 = doIntervention(1);
    const run1  = doLiveCandidateRun(cand1.candidateId, allIds);
    WorkflowStore.recordDecision({
      candidateId: cand1.candidateId,
      candidateVersion: cand1.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "rejected",
      rationale: "Not good enough.",
      decidedAt: new Date().toISOString(),
    });

    // Before startNewAttempt: current pointers still set
    expect(WorkflowStore.getCurrentIntervention()).not.toBeNull();
    expect(WorkflowStore.getCurrentCandidate()).not.toBeNull();

    WorkflowStore.startNewAttempt();

    // After startNewAttempt: pointers cleared, history preserved
    expect(WorkflowStore.getCurrentIntervention()).toBeNull();
    expect(WorkflowStore.getCurrentCandidate()).toBeNull();
    expect(WorkflowStore.getAllInterventions()).toHaveLength(1);
    expect(WorkflowStore.getAllCandidates()).toHaveLength(1);
    expect(WorkflowStore.getAllDecisions()).toHaveLength(1);

    // Run is still in RunStore
    expect(RunStore.getRun(run1.runId)).toBeDefined();

    // Candidate #1 is still "rejected" (immutable after decision)
    expect(WorkflowStore.getAllCandidates()[0].status).toBe("rejected");
    expect(WorkflowStore.getAllDecisions()[0].decision).toBe("rejected");
  });

  it("diagnosis status is reopened after startNewAttempt", () => {
    const allIds = FixtureRepository.getCases().map((c) => c.id);
    setupBaselineRun(allIds);
    setupDiagnosis();

    const cand1 = doIntervention(1);
    doLiveCandidateRun(cand1.candidateId, allIds);
    WorkflowStore.recordDecision({
      candidateId: cand1.candidateId,
      candidateVersion: cand1.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "rejected",
      rationale: "Not good enough.",
      decidedAt: new Date().toISOString(),
    });

    // After decision, diagnosis is resolved
    expect(WorkflowStore.getDiagnosis()?.status).toBe("resolved");

    WorkflowStore.startNewAttempt();

    // After startNewAttempt, diagnosis reopened
    expect(WorkflowStore.getDiagnosis()?.status).toBe("open");
  });
});

// ─────────────────────────────────────────────────────────────
// LIFE-05: 3-attempt cycle — full state correctness
//
// Reject #1, reject #2, accept #3. Verify:
//   - 3 interventions with attemptNumber 1, 2, 3
//   - 3 candidates with correct evaluatorVersion
//   - 3 decisions (rejected, rejected, accepted)
//   - currentCandidate is #3 with status "accepted"
//   - supersededVersion is set
// ─────────────────────────────────────────────────────────────
describe("LIFE-05: 3-attempt cycle — full state correctness", () => {
  beforeEach(() => {
    RunStore.reset();
    WorkflowStore.reset();
  });

  function do3AttemptCycle() {
    const allIds = FixtureRepository.getCases().map((c) => c.id);
    setupBaselineRun(allIds);
    setupDiagnosis();

    // Attempt #1 → reject
    const c1 = doIntervention(1);
    doLiveCandidateRun(c1.candidateId, allIds);
    WorkflowStore.recordDecision({
      candidateId: c1.candidateId,
      candidateVersion: c1.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "rejected",
      rationale: "Attempt 1 failed.",
      decidedAt: new Date().toISOString(),
    });
    WorkflowStore.startNewAttempt();

    // Attempt #2 → reject
    const c2 = doIntervention(2);
    doLiveCandidateRun(c2.candidateId, allIds);
    WorkflowStore.recordDecision({
      candidateId: c2.candidateId,
      candidateVersion: c2.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "rejected",
      rationale: "Attempt 2 still not good enough.",
      decidedAt: new Date().toISOString(),
    });
    WorkflowStore.startNewAttempt();

    // Attempt #3 → accept
    const c3 = doIntervention(3);
    doLiveCandidateRun(c3.candidateId, allIds);
    WorkflowStore.recordDecision({
      candidateId: c3.candidateId,
      candidateVersion: c3.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "accepted",
      rationale: "Attempt 3 shows clear improvement.",
      decidedAt: new Date().toISOString(),
    });

    return { c1, c2, c3 };
  }

  it("accumulates 3 interventions with sequential attemptNumbers", () => {
    do3AttemptCycle();
    const interventions = WorkflowStore.getAllInterventions();
    expect(interventions).toHaveLength(3);
    expect(interventions[0].attemptNumber).toBe(1);
    expect(interventions[1].attemptNumber).toBe(2);
    expect(interventions[2].attemptNumber).toBe(3);
  });

  it("accumulates 3 candidates with correct versions", () => {
    do3AttemptCycle();
    const candidates = WorkflowStore.getAllCandidates();
    expect(candidates).toHaveLength(3);
    expect(candidates[0].evaluatorVersion).toBe("v0.2.0-candidate.attempt1");
    expect(candidates[1].evaluatorVersion).toBe("v0.2.0-candidate.attempt2");
    expect(candidates[2].evaluatorVersion).toBe("v0.2.0-candidate.attempt3");
  });

  it("accumulates 3 decisions: rejected, rejected, accepted", () => {
    do3AttemptCycle();
    const decisions = WorkflowStore.getAllDecisions();
    expect(decisions).toHaveLength(3);
    expect(decisions[0].decision).toBe("rejected");
    expect(decisions[1].decision).toBe("rejected");
    expect(decisions[2].decision).toBe("accepted");
  });

  it("candidate statuses are correct after full cycle", () => {
    do3AttemptCycle();
    const candidates = WorkflowStore.getAllCandidates();
    expect(candidates[0].status).toBe("rejected");
    expect(candidates[1].status).toBe("rejected");
    expect(candidates[2].status).toBe("accepted");
  });

  it("supersededVersion is set after acceptance", () => {
    do3AttemptCycle();
    const state = WorkflowStore.getState();
    expect(state.supersededVersion).toBe("v0.2.0");
  });

  it("decisions link to correct candidate IDs", () => {
    const { c1, c2, c3 } = do3AttemptCycle();
    const decisions = WorkflowStore.getAllDecisions();
    expect(decisions[0].candidateId).toBe(c1.candidateId);
    expect(decisions[1].candidateId).toBe(c2.candidateId);
    expect(decisions[2].candidateId).toBe(c3.candidateId);
  });
});

// ─────────────────────────────────────────────────────────────
// LIFE-06: ID-scoped run isolation between attempts
//
// Candidate #2's revalidationRunId must NOT point to candidate #1's run.
// The revalidation page must see candidate #2's run when looking up
// getCurrentCandidateRunId().
// ─────────────────────────────────────────────────────────────
describe("LIFE-06: ID-scoped run isolation between candidates", () => {
  beforeEach(() => {
    RunStore.reset();
    WorkflowStore.reset();
  });

  it("getCurrentCandidateRunId returns candidate #2's run, not candidate #1's", () => {
    const allIds = FixtureRepository.getCases().map((c) => c.id);
    setupBaselineRun(allIds);
    setupDiagnosis();

    // Candidate #1 + run
    const c1   = doIntervention(1);
    const run1 = doLiveCandidateRun(c1.candidateId, allIds, "FAIL");
    WorkflowStore.recordDecision({
      candidateId: c1.candidateId,
      candidateVersion: c1.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "rejected",
      rationale: "Regressed.",
      decidedAt: new Date().toISOString(),
    });
    WorkflowStore.startNewAttempt();

    // Candidate #2 + run
    const c2   = doIntervention(2);
    const run2 = doLiveCandidateRun(c2.candidateId, allIds, "PASS");

    // The store must point to run2, NOT run1
    const currentRunId = WorkflowStore.getCurrentCandidateRunId();
    expect(currentRunId).toBe(run2.runId);
    expect(currentRunId).not.toBe(run1.runId);

    // Candidate records correctly link to their respective runs
    const candidates = WorkflowStore.getAllCandidates();
    expect(candidates[0].revalidationRunId).toBe(run1.runId);
    expect(candidates[1].revalidationRunId).toBe(run2.runId);
  });

  it("looking up old candidate's run by ID still works (history is intact)", () => {
    const allIds = FixtureRepository.getCases().map((c) => c.id);
    setupBaselineRun(allIds);
    setupDiagnosis();

    const c1   = doIntervention(1);
    const run1 = doLiveCandidateRun(c1.candidateId, allIds, "FAIL");
    WorkflowStore.recordDecision({
      candidateId: c1.candidateId,
      candidateVersion: c1.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "rejected",
      rationale: "Regressed.",
      decidedAt: new Date().toISOString(),
    });
    WorkflowStore.startNewAttempt();
    const c2 = doIntervention(2);
    doLiveCandidateRun(c2.candidateId, allIds, "PASS");

    // History: run1 is still in RunStore under its ID
    const historicRun = RunStore.getRun(run1.runId);
    expect(historicRun).toBeDefined();
    expect(historicRun!.status).toBe("completed");
    expect(historicRun!.evaluatorVersion).toBe("v0.2.0-candidate.attempt1");
  });
});

// ─────────────────────────────────────────────────────────────
// LIFE-07: Intervention form reinitialization (RC-3)
//
// Each attempt gets a fresh attemptNumber. The server component
// passes key={attemptNumber} so the client fully remounts.
// This test validates that the attempt number increments properly
// and that getCurrentIntervention() is null after startNewAttempt().
// ─────────────────────────────────────────────────────────────
describe("LIFE-07: attempt number increments; getCurrentIntervention resets", () => {
  beforeEach(() => {
    RunStore.reset();
    WorkflowStore.reset();
  });

  it("getCurrentIntervention is null immediately after startNewAttempt", () => {
    const allIds = FixtureRepository.getCases().map((c) => c.id);
    setupBaselineRun(allIds);
    setupDiagnosis();

    const c1 = doIntervention(1);
    doLiveCandidateRun(c1.candidateId, allIds);
    WorkflowStore.recordDecision({
      candidateId: c1.candidateId,
      candidateVersion: c1.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "rejected",
      rationale: "fail",
      decidedAt: new Date().toISOString(),
    });

    WorkflowStore.startNewAttempt();

    // currentInterventionId is now null → getCurrentIntervention returns null
    expect(WorkflowStore.getCurrentIntervention()).toBeNull();

    // getAllInterventions still has the old one
    expect(WorkflowStore.getAllInterventions()).toHaveLength(1);
    expect(WorkflowStore.getAllInterventions()[0].attemptNumber).toBe(1);
  });

  it("second intervention gets attemptNumber=2", () => {
    const allIds = FixtureRepository.getCases().map((c) => c.id);
    setupBaselineRun(allIds);
    setupDiagnosis();

    const c1 = doIntervention(1);
    doLiveCandidateRun(c1.candidateId, allIds);
    WorkflowStore.recordDecision({
      candidateId: c1.candidateId,
      candidateVersion: c1.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "rejected",
      rationale: "fail",
      decidedAt: new Date().toISOString(),
    });
    WorkflowStore.startNewAttempt();

    const c2 = doIntervention(2);
    expect(c2.attemptNumber).toBe(2);

    const iv2 = WorkflowStore.getCurrentIntervention();
    expect(iv2).not.toBeNull();
    expect(iv2!.attemptNumber).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────
// LIFE-08: Idempotency — createCandidate throws if one is already active
//
// Calling createCandidate() twice without a decision in between
// must throw, ensuring double-submission cannot create duplicates.
// ─────────────────────────────────────────────────────────────
describe("LIFE-08: idempotency guards", () => {
  beforeEach(() => {
    RunStore.reset();
    WorkflowStore.reset();
  });

  it("createIntervention throws if one is already active (no startNewAttempt called)", () => {
    setupDiagnosis();
    doIntervention(1);
    // currentInterventionId is set → second call must throw
    expect(() => doIntervention(2)).toThrow(/already active/i);
  });

  it("createCandidate throws if one is already under review", () => {
    setupDiagnosis();
    // doIntervention creates intervention + candidate in one go
    doIntervention(1);
    // A second candidate without startNewAttempt must throw (currentCandidateId is already set)
    expect(() => WorkflowStore.createCandidate({
      evaluatorVersion: "v0.2.0-candidate.extra2",
      rubricVersion: "rubric-v0.2-extra2",
      rubricText: "Another rubric",
      taxonomyVersion: "taxonomy-v0.1",
    })).toThrow(/already active/i);
  });

  it("startNewAttempt without a prior rejected decision does not corrupt state", () => {
    // startNewAttempt can be called even without a decision (edge case guard)
    setupDiagnosis();
    doIntervention(1);
    // Candidate not created, no decision — still safe to call (e.g. user navigates away)
    expect(() => WorkflowStore.startNewAttempt()).not.toThrow();
    expect(WorkflowStore.getCurrentIntervention()).toBeNull();
    expect(WorkflowStore.getCurrentCandidate()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// LIFE-09: Incremental rubric pre-fill — attempt #2 starts from candidate #1's rubric
//
// Verifies the computation the intervention page performs to determine
// which rubric text to pre-fill the textarea with on each new attempt.
// The logic: [...allCandidates].reverse().find(c => c.status === "rejected")?.rubricText
//            ?? BASELINE_RUBRIC_TEXT
// ─────────────────────────────────────────────────────────────
describe("LIFE-09: incremental rubric pre-fill — attempt #2 uses candidate #1 rubric", () => {
  const BASELINE = "Baseline rubric text (immutable)";

  beforeEach(() => {
    RunStore.reset();
    WorkflowStore.reset();
  });

  function computeStartingRubric(): string {
    const allCandidates    = WorkflowStore.getAllCandidates();
    const lastRejectedCand = [...allCandidates].reverse().find((c) => c.status === "rejected");
    return lastRejectedCand?.rubricText ?? BASELINE;
  }

  it("attempt #1 (no prior rejections) starts from the baseline rubric", () => {
    setupDiagnosis();
    // No candidates yet — must return BASELINE
    expect(computeStartingRubric()).toBe(BASELINE);
  });

  it("attempt #2 starts from candidate #1's rubricText, not the baseline", () => {
    setupDiagnosis();

    // Candidate #1: rubricText = "Rubric attempt 1 — tighten FAIL boundary"
    WorkflowStore.createIntervention({
      diagnosisId: WorkflowStore.getDiagnosis()!.id,
      baselineEvaluatorVersion: "v0.2.0",
      baselineRubricVersion: "rubric-v0.2",
      proposedRubricText: "Rubric attempt 1 — tighten FAIL boundary",
      rationale: "Addressing FAIL recall gap.",
      createdAt: new Date().toISOString(),
    });
    const cand1 = WorkflowStore.createCandidate({
      evaluatorVersion: "v0.2.0-candidate.attempt1",
      rubricVersion: "rubric-v0.2-proposed-1",
      rubricText: "Rubric attempt 1 — tighten FAIL boundary",
      taxonomyVersion: "taxonomy-v0.1",
    });
    WorkflowStore.recordDecision({
      candidateId: cand1.candidateId,
      candidateVersion: cand1.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "rejected",
      rationale: "Recall still below threshold.",
      decidedAt: new Date().toISOString(),
    });
    WorkflowStore.startNewAttempt();

    // The page computation must return candidate #1's rubricText
    expect(computeStartingRubric()).toBe("Rubric attempt 1 — tighten FAIL boundary");
    // And NOT the baseline
    expect(computeStartingRubric()).not.toBe(BASELINE);
  });
});

// ─────────────────────────────────────────────────────────────
// LIFE-10: Incremental rubric pre-fill — attempt #3 uses candidate #2's rubric
//
// Each consecutive rejection chains to the immediately preceding rubric.
// Candidate #1's rubric must NOT appear as the pre-fill for attempt #3.
// ─────────────────────────────────────────────────────────────
describe("LIFE-10: incremental rubric pre-fill — attempt #3 uses candidate #2 rubric, not #1", () => {
  const BASELINE = "Baseline rubric text (immutable)";

  beforeEach(() => {
    RunStore.reset();
    WorkflowStore.reset();
  });

  function computeStartingRubric(): string {
    const allCandidates    = WorkflowStore.getAllCandidates();
    const lastRejectedCand = [...allCandidates].reverse().find((c) => c.status === "rejected");
    return lastRejectedCand?.rubricText ?? BASELINE;
  }

  function rejectCandidate(n: number, rubricText: string) {
    WorkflowStore.createIntervention({
      diagnosisId: WorkflowStore.getDiagnosis()!.id,
      baselineEvaluatorVersion: "v0.2.0",
      baselineRubricVersion: "rubric-v0.2",
      proposedRubricText: rubricText,
      rationale: `Attempt ${n} rationale.`,
      createdAt: new Date().toISOString(),
    });
    const cand = WorkflowStore.createCandidate({
      evaluatorVersion: `v0.2.0-candidate.attempt${n}`,
      rubricVersion: `rubric-v0.2-proposed-${n}`,
      rubricText,
      taxonomyVersion: "taxonomy-v0.1",
    });
    WorkflowStore.recordDecision({
      candidateId: cand.candidateId,
      candidateVersion: cand.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "rejected",
      rationale: `Attempt ${n} rejected.`,
      decidedAt: new Date().toISOString(),
    });
    WorkflowStore.startNewAttempt();
  }

  it("after two rejections, pre-fill is candidate #2's rubric (not #1, not baseline)", () => {
    setupDiagnosis();

    // Attempt #1 → reject
    rejectCandidate(1, "Rubric v1 — initial FAIL boundary tightening");
    // Pre-fill for attempt #2 = candidate #1's rubric
    expect(computeStartingRubric()).toBe("Rubric v1 — initial FAIL boundary tightening");

    // Attempt #2 → reject (uses candidate #1's rubric as starting point, then modifies)
    rejectCandidate(2, "Rubric v2 — further refinement of edge cases");
    // Pre-fill for attempt #3 = candidate #2's rubric (most recent rejected)
    expect(computeStartingRubric()).toBe("Rubric v2 — further refinement of edge cases");

    // Explicitly assert it is NOT the baseline and NOT candidate #1's rubric
    expect(computeStartingRubric()).not.toBe(BASELINE);
    expect(computeStartingRubric()).not.toBe("Rubric v1 — initial FAIL boundary tightening");
  });

  it("all candidates remain in history after 3-attempt chain", () => {
    setupDiagnosis();
    rejectCandidate(1, "Rubric v1 — initial FAIL boundary tightening");
    rejectCandidate(2, "Rubric v2 — further refinement of edge cases");

    const allCandidates = WorkflowStore.getAllCandidates();
    expect(allCandidates).toHaveLength(2);
    expect(allCandidates[0].rubricText).toBe("Rubric v1 — initial FAIL boundary tightening");
    expect(allCandidates[1].rubricText).toBe("Rubric v2 — further refinement of edge cases");
    expect(allCandidates.every((c) => c.status === "rejected")).toBe(true);
  });

  it("the baseline rubric text is never mutated across any attempt", () => {
    setupDiagnosis();
    rejectCandidate(1, "Rubric v1 — initial FAIL boundary tightening");
    rejectCandidate(2, "Rubric v2 — further refinement of edge cases");

    // BASELINE is a module-level constant; no store mutation should touch it.
    // Verified by checking that the first candidate's rubricText differs from BASELINE.
    const allCandidates = WorkflowStore.getAllCandidates();
    expect(allCandidates[0].rubricText).not.toBe(BASELINE);
    expect(allCandidates[1].rubricText).not.toBe(BASELINE);
    // The computation still falls back to BASELINE when there are no rejected candidates
    WorkflowStore.reset();
    expect(computeStartingRubric()).toBe(BASELINE);
  });
});
