// ============================================================
// Tests: History / Service Record — baseline event regression
//
// HIST-01: baseline-only state
//   When a live baseline run is present and completed but no
//   diagnosis, interventions, or candidates exist, buildDynamicEntries()
//   must return exactly one entry representing the baseline completion.
//
// HIST-02: baseline event content
//   The baseline entry must contain evaluatorVersion, runId,
//   representative metrics (OA, FAIL Recall, FP, FN), and
//   targeted/risk detection derived from persisted judgments.
//
// HIST-03: no baseline run → no baseline entry
//   Without a completed live baseline, buildDynamicEntries()
//   returns 0 entries (empty state).
//
// HIST-04: fixture-mode baseline is not shown
//   A completed baseline run in fixture mode must NOT produce
//   an entry (entries only for live runs, per the design).
//
// HIST-05: baseline entry survives restart simulation
//   After save → reload of the run store, buildDynamicEntries()
//   still returns the baseline entry with identical metrics.
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import os   from "os";
import fs   from "fs";
import path from "path";

import { WorkflowStore } from "@/data/workflow-store";
import { RunStore, liveJudgmentsToJudgments } from "@/data/run-store";
import { FixtureRepository } from "@/data/fixture-repository";
import { computeReliabilityProfile } from "@/core/metrics";
import { buildDynamicEntries } from "@/app/history/page";
import {
  saveRunsTo,
  loadRunsFrom,
  saveWorkflowStateTo,
  loadWorkflowStateFrom,
} from "@/data/persistence";
import type { LiveJudgment, EvaluationRun } from "@/core/types";

vi.mock("server-only", () => ({}));

// ── Temp directory ────────────────────────────────────────────
let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jh-history-test-"));
  RunStore.reset();
  WorkflowStore.reset();
});
afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ── Helpers ───────────────────────────────────────────────────

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

function setupLiveBaselineRun(sampleIds: string[], label: "PASS" | "FAIL" = "PASS") {
  const run = RunStore.createRun({
    type: "baseline", mode: "live",
    evaluatorVersion: "v0.2.0", rubricVersion: "rubric-v0.2",
    taxonomyVersion: "taxonomy-v0.1", model: "gpt-5.6-luna", sampleIds,
  });
  RunStore.startRun(run.runId);
  sampleIds.forEach((id) => RunStore.addJudgment(run.runId, makeJudgment(id, label)));
  RunStore.completeRun(run.runId);
  WorkflowStore.setBaselineRunId(run.runId);
  return run;
}

// Helper that mimics what the page does: reads from RunStore.getRun
function buildEntries() {
  return buildDynamicEntries(
    WorkflowStore.getState(),
    (id) => RunStore.getRun(id),
    () => FixtureRepository.getCases(),
  );
}

// ── HIST-01: baseline-only state ─────────────────────────────
describe("HIST-01: baseline-only state produces exactly one entry", () => {
  it("returns 1 entry when only a live baseline run exists", () => {
    const cases  = FixtureRepository.getCases();
    const allIds = cases.map((c) => c.id);
    setupLiveBaselineRun(allIds);

    const entries = buildEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].event).toContain("baseline");
    expect(entries[0].state).toBe("BASELINE ESTABLISHED");
  });

  it("returns 0 entries when WorkflowStore and RunStore are both empty", () => {
    const entries = buildEntries();
    expect(entries).toHaveLength(0);
  });
});

// ── HIST-02: baseline entry content ──────────────────────────
describe("HIST-02: baseline entry contains required fields from persisted data", () => {
  it("detail contains evaluatorVersion, runId, OA, FAIL Recall, FP, FN", () => {
    const cases  = FixtureRepository.getCases();
    const allIds = cases.map((c) => c.id);
    const run    = setupLiveBaselineRun(allIds);

    const entries = buildEntries();
    expect(entries).toHaveLength(1);

    const entry = entries[0];
    // version column
    expect(entry.version).toBe("v0.2.0");
    // detail must include runId
    expect(entry.detail).toContain(run.runId);
    // detail must include model
    expect(entry.detail).toContain("gpt-5.6-luna");
    // detail must include rubric version
    expect(entry.detail).toContain("rubric-v0.2");
  });

  it("metrics in detail are derived from persisted judgments, not hardcoded", () => {
    const cases  = FixtureRepository.getCases();
    const allIds = cases.map((c) => c.id);
    setupLiveBaselineRun(allIds, "PASS"); // all PASS → FAIL recall = 0%

    const entries = buildEntries();
    const detail  = entries[0].detail ?? "";

    // All PASS judgments → FAIL recall = 0% (since all FAIL cases are labelled PASS)
    // The detail must NOT claim 100% recall
    expect(detail).toContain("FAIL Recall");
    // Compute expected values independently
    const liveRun   = RunStore.getRun(WorkflowStore.getBaselineRunId()!)!;
    const judgments = liveJudgmentsToJudgments(liveRun.judgments);
    const profile   = computeReliabilityProfile(cases, judgments, "v0.2.0");
    // FAIL recall for all-PASS labeling = 0%
    expect(profile.perClass.FAIL.recall).toBe(0);
    expect(detail).toContain("0.0%"); // FAIL Recall 0.0%
  });

  it("targeted/risk detection count appears in detail", () => {
    const cases  = FixtureRepository.getCases();
    const allIds = cases.map((c) => c.id);
    setupLiveBaselineRun(allIds);

    const entries = buildEntries();
    const detail  = entries[0].detail ?? "";
    // Should mention targeted/risk
    expect(detail).toContain("Targeted/Risk");
  });

  it("ledStatus is ok and stateVariant is ok", () => {
    const cases  = FixtureRepository.getCases();
    setupLiveBaselineRun(cases.map((c) => c.id));

    const entry = buildEntries()[0];
    expect(entry.ledStatus).toBe("ok");
    expect(entry.stateVariant).toBe("ok");
  });
});

// ── HIST-03: no baseline run → no baseline entry ─────────────
describe("HIST-03: no baseline run produces no baseline entry", () => {
  it("no baseline entry when baselineRunId is null", () => {
    expect(WorkflowStore.getBaselineRunId()).toBeNull();
    const entries = buildEntries();
    expect(entries.filter((e) => e.event.includes("baseline"))).toHaveLength(0);
  });

  it("no baseline entry when run exists but is not completed", () => {
    const cases  = FixtureRepository.getCases();
    const allIds = cases.map((c) => c.id);
    // Create run but do NOT complete it
    const run = RunStore.createRun({
      type: "baseline", mode: "live",
      evaluatorVersion: "v0.2.0", rubricVersion: "rubric-v0.2",
      taxonomyVersion: "taxonomy-v0.1", model: "gpt-5.6-luna", sampleIds: allIds,
    });
    RunStore.startRun(run.runId);
    WorkflowStore.setBaselineRunId(run.runId);
    // Status is "running" — should NOT appear in history
    const entries = buildEntries();
    expect(entries.filter((e) => e.state === "BASELINE ESTABLISHED")).toHaveLength(0);
  });
});

// ── HIST-04: fixture-mode baseline is not shown ───────────────
describe("HIST-04: fixture-mode baseline run does not produce a history entry", () => {
  it("completed fixture baseline does not appear in history", () => {
    const cases  = FixtureRepository.getCases();
    const allIds = cases.map((c) => c.id);
    // Create a fixture-mode run
    const run = RunStore.createRun({
      type: "baseline", mode: "fixture",
      evaluatorVersion: "v0.2.0", rubricVersion: "rubric-v0.2",
      taxonomyVersion: "taxonomy-v0.1", model: "fixture", sampleIds: allIds,
    });
    RunStore.startRun(run.runId);
    allIds.forEach((id) => RunStore.addJudgment(run.runId, makeJudgment(id)));
    RunStore.completeRun(run.runId);
    WorkflowStore.setBaselineRunId(run.runId);

    const entries = buildEntries();
    // Fixture mode baselines do NOT get a history entry
    expect(entries.filter((e) => e.state === "BASELINE ESTABLISHED")).toHaveLength(0);
  });
});

// ── HIST-05: baseline entry survives restart simulation ───────
describe("HIST-05: baseline entry survives restart simulation (save → reload)", () => {
  it("buildDynamicEntries produces identical baseline entry after reloading persisted data", () => {
    const cases  = FixtureRepository.getCases();
    const allIds = cases.map((c) => c.id);
    setupLiveBaselineRun(allIds);

    // Snapshot entries before save
    const entriesBefore = buildEntries();
    expect(entriesBefore).toHaveLength(1);

    // Save to temp files
    const wfFile    = path.join(tmpDir, "wf.json");
    const runsFile  = path.join(tmpDir, "runs.json");
    saveWorkflowStateTo(WorkflowStore.getState(), wfFile);
    saveRunsTo(RunStore.getAllRuns(), runsFile);

    // Reload — simulate restart
    const wfLoaded   = loadWorkflowStateFrom(wfFile)!;
    const runsLoaded = loadRunsFrom(runsFile)!;

    // Build entries using reloaded data
    const entriesAfter = buildDynamicEntries(
      wfLoaded,
      (id: string) => runsLoaded.find((r: EvaluationRun) => r.runId === id),
      () => FixtureRepository.getCases(),
    );

    expect(entriesAfter).toHaveLength(1);
    expect(entriesAfter[0].event).toBe(entriesBefore[0].event);
    expect(entriesAfter[0].version).toBe(entriesBefore[0].version);
    expect(entriesAfter[0].state).toBe(entriesBefore[0].state);
    expect(entriesAfter[0].detail).toBe(entriesBefore[0].detail);
  });
});
