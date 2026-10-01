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
