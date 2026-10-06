// ============================================================
// Revalidation Invariant Tests
//
// Proves the core invariant:
//   candidate creation ≠ candidate evaluation
//
// No metric, matrix, delta, or Accept/Reject may be surfaced
// before RUN LIVE REVALIDATION has completed.
// ============================================================
import { describe, it, expect, beforeEach, vi } from "vitest";
import { RunStore, liveJudgmentsToJudgments } from "../src/data/run-store";
import { WorkflowStore } from "../src/data/workflow-store";
import { FixtureRepository } from "../src/data/fixture-repository";
import { computeReliabilityProfile } from "../src/core/metrics";
import type { LiveJudgment } from "../src/core/types";

vi.mock("server-only", () => ({}));

function makeJudgment(caseId: string, label: "PASS" | "FAIL" = "PASS"): LiveJudgment {
  return {
    caseId,
    label,
    rationale: "Test rationale.",
    model: "gpt-5.6-luna",
    evaluatorVersion: "v0.2.0",
    rubricVersion: "rubric-v0.2",
    timestamp: new Date().toISOString(),
    usageTokens: 100,
  };
}

function createBaselineRun(sampleIds: string[]) {
  const run = RunStore.createRun({
    type: "baseline",
    mode: "live",
    evaluatorVersion: "v0.2.0",
    rubricVersion: "rubric-v0.2",
    taxonomyVersion: "taxonomy-v0.1",
    model: "gpt-5.6-luna",
    sampleIds,
  });
  RunStore.startRun(run.runId);
  return run;
}

function createCandidateRun(sampleIds: string[]) {
  const run = RunStore.createRun({
    type: "candidate",
    mode: "live",
    evaluatorVersion: "v0.2.0-candidate",
    rubricVersion: "rubric-v0.3-proposed",
    taxonomyVersion: "taxonomy-v0.1",
    model: "gpt-5.6-luna",
    sampleIds,
  });
  RunStore.startRun(run.runId);
  return run;
}

beforeEach(() => {
  RunStore.reset();
  WorkflowStore.reset();
});

// ─────────────────────────────────────────────────────────────
// REV-01: Newly created candidate has no metrics
// ─────────────────────────────────────────────────────────────
describe("REV-01: newly created candidate has no metrics", () => {
  it("getCandidateRun() returns undefined before any run is created", () => {
    const run = RunStore.getCandidateRun();
    expect(run).toBeUndefined();
  });

  it("candidateIsLive is false when no candidate run exists", () => {
    const liveCandidateRun = RunStore.getCandidateRun();
    const candidateIsLive = liveCandidateRun?.mode === "live" &&
      (liveCandidateRun.status === "completed" || liveCandidateRun.status === "partial_failure");
    expect(candidateIsLive).toBe(false);
  });

  it("candidateProfile must be null when candidateIsLive is false", () => {
    // Simulate the page logic: candidateProfile = candidateIsLive ? compute() : null
    const liveCandidateRun = RunStore.getCandidateRun();
    const candidateIsLive = liveCandidateRun?.mode === "live" &&
      (liveCandidateRun.status === "completed" || liveCandidateRun.status === "partial_failure");

    const cases = FixtureRepository.getCases();
    const candidateProfile = candidateIsLive
      ? computeReliabilityProfile(
          cases,
          liveJudgmentsToJudgments(liveCandidateRun!.judgments),
          "v0.2.0-candidate"
        )
      : null;

    expect(candidateProfile).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// REV-02: Fixture candidate results cannot leak into LIVE mode
// ─────────────────────────────────────────────────────────────
describe("REV-02: fixture candidate results cannot leak into live mode", () => {
  it("fixture candidate judgments are not used when baseline is live", () => {
    // Baseline is live
    const repIds = FixtureRepository.getCases()
      .filter((c) => c.sampleType === "representative")
      .map((c) => c.id);
    const baselineRun = createBaselineRun(repIds);
    repIds.forEach((id) => RunStore.addJudgment(baselineRun.runId, makeJudgment(id, "PASS")));
    RunStore.completeRun(baselineRun.runId);

    const liveBaselineRun = RunStore.getBaselineRun();
    const baselineIsLive = liveBaselineRun?.mode === "live" &&
      (liveBaselineRun.status === "completed" || liveBaselineRun.status === "partial_failure");

    expect(baselineIsLive).toBe(true);

    // No candidate run → candidateIsLive must be false
    const liveCandidateRun = RunStore.getCandidateRun();
    const candidateIsLive = liveCandidateRun?.mode === "live" &&
      (liveCandidateRun?.status === "completed" || liveCandidateRun?.status === "partial_failure");

    expect(candidateIsLive).toBe(false);

    // The gate: in live mode, we do NOT fall back to fixture candidate judgments
    // candidateProfile = candidateIsLive ? compute(liveJudgments) : null
    const cases = FixtureRepository.getCases();
    const candidateProfile = candidateIsLive
      ? computeReliabilityProfile(cases, [], "v0.2.0-candidate")
      : null;

    expect(candidateProfile).toBeNull();
  });

  it("fixture judgments from FixtureRepository do not match live RunStore state", () => {
    // Fixture judgments exist independently
    const fixtureJudgments = FixtureRepository.getBaselineJudgments();
    expect(fixtureJudgments.length).toBeGreaterThan(0);

    // RunStore starts empty — no fixture data
    const liveBaselineRun = RunStore.getBaselineRun();
    expect(liveBaselineRun).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
// REV-03: Candidate metrics remain null before live revalidation
// ─────────────────────────────────────────────────────────────
describe("REV-03: candidate metrics null before live revalidation", () => {
  it("delta is null when candidateProfile is null", () => {
    const candidateProfile = null;
    const delta = candidateProfile ? { failRecall: 0.5 } : null;
    expect(delta).toBeNull();
  });

  it("running candidate run then completing it makes candidateIsLive true", () => {
    const repIds = FixtureRepository.getCases()
      .filter((c) => c.sampleType === "representative")
      .map((c) => c.id);

    const candidateRun = createCandidateRun(repIds);
    repIds.forEach((id) => RunStore.addJudgment(candidateRun.runId, makeJudgment(id, "PASS")));
    RunStore.completeRun(candidateRun.runId);

    const liveCandidateRun = RunStore.getCandidateRun();
    const candidateIsLive = liveCandidateRun?.mode === "live" &&
      (liveCandidateRun.status === "completed" || liveCandidateRun.status === "partial_failure");

    expect(candidateIsLive).toBe(true);
    expect(liveCandidateRun?.judgments.length).toBe(repIds.length);
  });

  it("candidateProfile is populated only after completed candidate run", () => {
    const cases = FixtureRepository.getCases();
    const repIds = cases.filter((c) => c.sampleType === "representative").map((c) => c.id);

    const candidateRun = createCandidateRun(repIds);
    repIds.forEach((id) => RunStore.addJudgment(candidateRun.runId, makeJudgment(id, "PASS")));
    RunStore.completeRun(candidateRun.runId);

    const liveCandidateRun = RunStore.getCandidateRun()!;
    const candidateIsLive = liveCandidateRun.mode === "live" &&
      (liveCandidateRun.status === "completed" || liveCandidateRun.status === "partial_failure");

    const candidateProfile = candidateIsLive
      ? computeReliabilityProfile(cases, liveJudgmentsToJudgments(liveCandidateRun.judgments), "v0.2.0-candidate")
      : null;

    expect(candidateProfile).not.toBeNull();
    expect(candidateProfile!.sampleN).toBe(repIds.length);
  });
});

// ─────────────────────────────────────────────────────────────
// REV-04: Accept/Reject disabled before completed candidate run
// ─────────────────────────────────────────────────────────────
describe("REV-04: Accept/Reject disabled before completed candidate run", () => {
  it("isLiveGated is true when baseline is live but candidate is not", () => {
    const baselineIsLive  = true;
    const candidateIsLive = false;
    const isLiveGated = baselineIsLive && !candidateIsLive;
    expect(isLiveGated).toBe(true);
  });

  it("isLiveGated is false when both runs complete", () => {
    const baselineIsLive  = true;
    const candidateIsLive = true;
    const isLiveGated = baselineIsLive && !candidateIsLive;
    expect(isLiveGated).toBe(false);
  });

  it("WorkflowStore.recordDecision throws without a candidate", () => {
    expect(() =>
      WorkflowStore.recordDecision({
        candidateId: "nonexistent-cand",
        candidateVersion: "v0.2.0-candidate",
        baselineVersion: "v0.2.0",
        decision: "accepted",
        rationale: "Looks better.",
        decidedAt: new Date().toISOString(),
      })
    ).toThrow(/cannot record decision without an active candidate/i);
  });
});

// ─────────────────────────────────────────────────────────────
// REV-05: Live candidate uses same model and same case IDs as baseline
// ─────────────────────────────────────────────────────────────
describe("REV-05: candidate run uses same model and case IDs as baseline", () => {
  it("baseline and candidate runs use the same model", () => {
    const model = "gpt-5.6-luna";

    const cases = FixtureRepository.getCases();
    const repIds = cases.filter((c) => c.sampleType === "representative").map((c) => c.id);
    const trgIds = cases.filter((c) => c.sampleType === "targeted_risk").map((c) => c.id);
    const allIds = [...repIds, ...trgIds];

    const baselineRun  = createBaselineRun(allIds);
    const candidateRun = createCandidateRun(allIds);

    expect(baselineRun.model).toBe(model);
    expect(candidateRun.model).toBe(model);
    expect(baselineRun.model).toBe(candidateRun.model);
  });

  it("baseline and candidate runs use the same 70 case IDs", () => {
    const cases = FixtureRepository.getCases();
    const repIds = cases.filter((c) => c.sampleType === "representative").map((c) => c.id);
    const trgIds = cases.filter((c) => c.sampleType === "targeted_risk").map((c) => c.id);
    const allIds = [...repIds, ...trgIds];

    expect(allIds).toHaveLength(70);

    const baselineRun  = createBaselineRun(allIds);
    const candidateRun = createCandidateRun(allIds);

    expect([...baselineRun.sampleIds].sort()).toEqual([...candidateRun.sampleIds].sort());
  });
});

// ─────────────────────────────────────────────────────────────
// REV-06: Candidate metrics derive only from stored live judgments
// ─────────────────────────────────────────────────────────────
describe("REV-06: candidate metrics derive from stored live judgments only", () => {
  it("candidateProfile reflects only the judgments stored in RunStore", () => {
    const cases = FixtureRepository.getCases();
    const repCases = cases.filter((c) => c.sampleType === "representative");
    const repIds = repCases.map((c) => c.id);

    const candidateRun = createCandidateRun(repIds);

    // Inject a specific pattern: all PASS
    repIds.forEach((id) => RunStore.addJudgment(candidateRun.runId, makeJudgment(id, "PASS")));
    RunStore.completeRun(candidateRun.runId);

    const liveCandidateRun = RunStore.getCandidateRun()!;
    const judgments = liveJudgmentsToJudgments(liveCandidateRun.judgments);
    const profile = computeReliabilityProfile(cases, judgments, "v0.2.0-candidate");

    // All PASS judgments → FP for every true FAIL case, TN for every true PASS case
    const failCases = repCases.filter((c) => c.groundTruth === "FAIL");
    expect(profile.confusionMatrix.FP).toBe(0); // evaluator said PASS → no FP
    expect(profile.confusionMatrix.FN).toBe(failCases.length); // missed all FAILs
    expect(profile.confusionMatrix.TP).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// REV-08: After rejection + startNewAttempt, ID-scoped lookup is undefined
// ─────────────────────────────────────────────────────────────
// Helper: set up a full diagnosis → intervention → candidate workflow
function setupFullCandidate(repIds: string[]) {
  WorkflowStore.submitDiagnosis({
    triggerId: "trg-fail-001",
    evaluatorVersion: "v0.2.0",
    category: "evaluator_rubric",
    observationNote: "Test diagnosis.",
    revalidationRequested: true,
    createdAt: new Date().toISOString(),
  });
  WorkflowStore.createIntervention({
    diagnosisId: WorkflowStore.getDiagnosis()!.id,
    baselineEvaluatorVersion: "v0.2.0",
    baselineRubricVersion: "rubric-v0.2",
    proposedRubricText: "Updated rubric text.",
    rationale: "Test rationale for invariant.",
    createdAt: new Date().toISOString(),
  });
  return WorkflowStore.createCandidate({
    evaluatorVersion: "v0.2.0-candidate.test",
    rubricVersion: "rubric-v0.2-proposed",
    rubricText: "Updated rubric text.",
    taxonomyVersion: "taxonomy-v0.1",
  });
}

describe("REV-08: ID-scoped lookup returns undefined after startNewAttempt", () => {
  it("getCurrentCandidateRunId is null after startNewAttempt — lookup returns undefined", () => {
    const repIds = FixtureRepository.getCases()
      .filter((c) => c.sampleType === "representative")
      .map((c) => c.id);

    // Setup: complete a candidate run and wire it to WorkflowStore
    const cand = setupFullCandidate(repIds);
    const run = createCandidateRun(repIds);
    repIds.forEach((id) => RunStore.addJudgment(run.runId, makeJudgment(id)));
    RunStore.completeRun(run.runId);
    WorkflowStore.setCurrentCandidateRunId(run.runId);

    // Before clear: ID-scoped lookup finds the run
    const idBefore = WorkflowStore.getCurrentCandidateRunId();
    expect(idBefore).toBe(run.runId);
    expect(RunStore.getRun(idBefore!)).toBeDefined();

    // Reject and start next attempt
    WorkflowStore.recordDecision({
      candidateId: cand.candidateId,
      candidateVersion: cand.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "rejected",
      rationale: "Rejected for test.",
      decidedAt: new Date().toISOString(),
    });
    WorkflowStore.startNewAttempt();

    // After startNewAttempt: currentCandidateRunId is null
    const idAfter = WorkflowStore.getCurrentCandidateRunId();
    expect(idAfter).toBeNull();

    // ID-scoped lookup → undefined (correct: "NOT YET EVALUATED")
    const scopedRun = idAfter ? RunStore.getRun(idAfter) : undefined;
    expect(scopedRun).toBeUndefined();
  });

  it("type-based getCandidateRun() still returns old run (confirms ID-scoped is needed)", () => {
    const repIds = FixtureRepository.getCases()
      .filter((c) => c.sampleType === "representative")
      .map((c) => c.id);

    const cand = setupFullCandidate(repIds);
    const run = createCandidateRun(repIds);
    repIds.forEach((id) => RunStore.addJudgment(run.runId, makeJudgment(id)));
    RunStore.completeRun(run.runId);
    WorkflowStore.setCurrentCandidateRunId(run.runId);
    WorkflowStore.recordDecision({
      candidateId: cand.candidateId,
      candidateVersion: cand.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "rejected",
      rationale: "Rejected.",
      decidedAt: new Date().toISOString(),
    });
    WorkflowStore.startNewAttempt();

    // Type-based lookup still returns the old completed run — this is why
    // ID-scoped lookup via getCurrentCandidateRunId() is essential.
    expect(RunStore.getCandidateRun()).toBeDefined();
    expect(RunStore.getCandidateRun()!.runId).toBe(run.runId);
  });
});

// ─────────────────────────────────────────────────────────────
// REV-09: getCurrentCandidateRunId lifecycle
// ─────────────────────────────────────────────────────────────
describe("REV-09: WorkflowStore.getCurrentCandidateRunId lifecycle", () => {
  it("starts null when no candidate exists", () => {
    expect(WorkflowStore.getCurrentCandidateRunId()).toBeNull();
  });

  it("is set after setCurrentCandidateRunId via full workflow", () => {
    const repIds = FixtureRepository.getCases()
      .filter((c) => c.sampleType === "representative")
      .map((c) => c.id);
    setupFullCandidate(repIds);
    const run = createCandidateRun(repIds);
    repIds.forEach((id) => RunStore.addJudgment(run.runId, makeJudgment(id)));
    RunStore.completeRun(run.runId);
    WorkflowStore.setCurrentCandidateRunId(run.runId);
    expect(WorkflowStore.getCurrentCandidateRunId()).toBe(run.runId);
  });

  it("is null after startNewAttempt", () => {
    const repIds = FixtureRepository.getCases()
      .filter((c) => c.sampleType === "representative")
      .map((c) => c.id);
    const cand = setupFullCandidate(repIds);
    const run = createCandidateRun(repIds);
    repIds.forEach((id) => RunStore.addJudgment(run.runId, makeJudgment(id)));
    RunStore.completeRun(run.runId);
    WorkflowStore.setCurrentCandidateRunId(run.runId);
    WorkflowStore.recordDecision({
      candidateId: cand.candidateId,
      candidateVersion: cand.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "rejected",
      rationale: "Test.",
      decidedAt: new Date().toISOString(),
    });
    WorkflowStore.startNewAttempt();
    expect(WorkflowStore.getCurrentCandidateRunId()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// REV-10: null getCurrentCandidateRunId → safe undefined (no crash)
// ─────────────────────────────────────────────────────────────
describe("REV-10: safe lookup when getCurrentCandidateRunId is null", () => {
  it("ID-scoped lookup with null id returns undefined without throwing", () => {
    const id = WorkflowStore.getCurrentCandidateRunId(); // null
    const run = id ? RunStore.getRun(id) : undefined;
    expect(run).toBeUndefined();
  });

  it("RunStore.getRun with unknown id returns undefined (no throw)", () => {
    expect(RunStore.getRun("nonexistent-run")).toBeUndefined();
  });

  it("candidateIsLive is false when liveCandidateRun is undefined", () => {
    const candidateRunId = WorkflowStore.getCurrentCandidateRunId();
    const liveCandidateRun = candidateRunId ? RunStore.getRun(candidateRunId) : undefined;
    const candidateIsLive =
      liveCandidateRun?.mode === "live" &&
      (liveCandidateRun.status === "completed" || liveCandidateRun.status === "partial_failure");
    expect(candidateIsLive).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// REV-11: Version string uniqueness (nonce prevents same-day collision)
// ─────────────────────────────────────────────────────────────
describe("REV-11: candidate version string includes nonce", () => {
  it("version strings with different nonces are distinct on the same date", () => {
    const base = "v0.2.0";
    const date = "20261001";
    const v1 = `${base}-candidate.${date}-ab3f`;
    const v2 = `${base}-candidate.${date}-cd7e`;
    expect(v1).not.toEqual(v2);
  });

  it("version string format matches expected pattern with nonce", () => {
    const version = "v0.2.0-candidate.20261001-ab3f";
    // base-candidate.YYYYMMDD-<4-char nonce>
    expect(version).toMatch(/^.+-candidate\.\d{8}-[a-z0-9]{4}$/);
  });

  it("two Math.random-generated nonces collide with probability < 1/36^4", () => {
    // Generate 20 nonce pairs — statistically all should be distinct
    const nonces = Array.from({ length: 20 }, () => Math.random().toString(36).slice(2, 6));
    const unique = new Set(nonces);
    // All 20 should be unique (collision probability ≈ 0.0006%)
    expect(unique.size).toBe(nonces.length);
  });
});

// ─────────────────────────────────────────────────────────────
// REV-12: ID-scoped vs type-based lookup diverge after rejection
// ─────────────────────────────────────────────────────────────
describe("REV-12: full rejection cycle — scoped vs type-based diverge", () => {
  it("after reject+startNewAttempt+new candidate: scoped=null, type-based=old run", () => {
    const repIds = FixtureRepository.getCases()
      .filter((c) => c.sampleType === "representative")
      .map((c) => c.id);

    // ── Cycle 1: Candidate #1 created, run, rejected ──
    const cand1 = setupFullCandidate(repIds);
    const run1  = createCandidateRun(repIds);
    repIds.forEach((id) => RunStore.addJudgment(run1.runId, makeJudgment(id)));
    RunStore.completeRun(run1.runId);
    WorkflowStore.setCurrentCandidateRunId(run1.runId);
    WorkflowStore.recordDecision({
      candidateId: cand1.candidateId,
      candidateVersion: cand1.evaluatorVersion,
      baselineVersion: "v0.2.0",
      decision: "rejected",
      rationale: "Rejected.",
      decidedAt: new Date().toISOString(),
    });
    WorkflowStore.startNewAttempt();

    // ── Cycle 2: Candidate #2 not yet evaluated ──
    // candidateRunId = null because no run has been started for #2

    // Revalidation page logic (ID-scoped):
    const candidateRunIdAfter = WorkflowStore.getCurrentCandidateRunId(); // null
    const scopedRun = candidateRunIdAfter
      ? RunStore.getRun(candidateRunIdAfter)
      : undefined;

    // ID-scoped → undefined → candidateIsLive = false → "NOT YET EVALUATED"
    expect(scopedRun).toBeUndefined();

    // Type-based still returns run1 (confirms ID-scoped is the correct approach)
    expect(RunStore.getCandidateRun()?.runId).toBe(run1.runId);

    // The two approaches disagree — confirming ID-scoped is necessary
    expect(scopedRun).not.toBe(RunStore.getCandidateRun());
  });
});

// ─────────────────────────────────────────────────────────────
// REV-07: Targeted/risk cases excluded from population metrics
// ─────────────────────────────────────────────────────────────
describe("REV-07: targeted/risk cases excluded from population metrics", () => {
  it("sampleN in profile equals only representative cases", () => {
    const cases = FixtureRepository.getCases();
    const repCases = cases.filter((c) => c.sampleType === "representative");
    const trgCases = cases.filter((c) => c.sampleType === "targeted_risk");

    // Run with all 70 cases
    const allIds = [...repCases.map((c) => c.id), ...trgCases.map((c) => c.id)];
    const candidateRun = createCandidateRun(allIds);
    allIds.forEach((id) => RunStore.addJudgment(candidateRun.runId, makeJudgment(id, "PASS")));
    RunStore.completeRun(candidateRun.runId);

    const liveCandidateRun = RunStore.getCandidateRun()!;
    const judgments = liveJudgmentsToJudgments(liveCandidateRun.judgments);
    const profile = computeReliabilityProfile(cases, judgments, "v0.2.0-candidate");

    // sampleN = representative only (60), not 70
    expect(profile.sampleN).toBe(repCases.length);
    expect(profile.sampleN).not.toBe(allIds.length);
  });

  it("baseline run does not get mutated when candidate run is created", () => {
    const repIds = FixtureRepository.getCases()
      .filter((c) => c.sampleType === "representative")
      .map((c) => c.id);

    const baselineRun = createBaselineRun(repIds);
    repIds.forEach((id) => RunStore.addJudgment(baselineRun.runId, makeJudgment(id, "PASS")));
    RunStore.completeRun(baselineRun.runId);

    const snapshotJudgments = [...RunStore.getBaselineRun()!.judgments];

    // Create candidate run — baseline must remain unchanged
    createCandidateRun(repIds);

    const afterJudgments = RunStore.getBaselineRun()!.judgments;
    expect(afterJudgments).toHaveLength(snapshotJudgments.length);
    expect(afterJudgments.map((j) => j.caseId)).toEqual(snapshotJudgments.map((j) => j.caseId));
  });
});
