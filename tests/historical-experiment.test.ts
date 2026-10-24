// ============================================================
// Run #0001 stays a read-only historical experiment.
// File hashes are checked only when the local JSON is present.
// Missing files skip that check instead of inventing the history.
// ============================================================
import { createHash } from "crypto";
import fs from "fs";
import { describe, expect, it, vi } from "vitest";
import manifest from "@/data/historical-integrity-manifest.json";
import {
  HISTORICAL_EXPERIMENT_ID,
  HISTORICAL_RUNS_FILE,
  HISTORICAL_WORKFLOW_FILE,
  HistoricalWriteRejectedError,
  historicalMutationAllowed,
  readHistoricalExperiment,
  type HistoricalWorkflowSource,
} from "@/data/historical-experiment";
import { saveRunsTo, saveWorkflowStateTo } from "@/data/persistence";
import { RunStore } from "@/data/run-store";
import { WorkflowStore } from "@/data/workflow-store";
import type { EvaluationRun } from "@/core/types";

vi.mock("server-only", () => ({}));

function sha256(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

const historicalFilesPresent =
  fs.existsSync(HISTORICAL_WORKFLOW_FILE) && fs.existsSync(HISTORICAL_RUNS_FILE);

describe("readHistoricalExperiment", () => {
  it("returns a frozen archived snapshot", () => {
    const experiment = readHistoricalExperiment(
      {
        diagnosis: null,
        interventions: [],
        candidates: [],
        decisions: [],
        baselineRunId: "run-baseline",
        supersededVersion: null,
      },
      [],
    );

    expect(experiment.id).toBe(HISTORICAL_EXPERIMENT_ID);
    expect(experiment.status).toBe("archived");
    expect(experiment.readOnly).toBe(true);
    expect(() => {
      experiment.candidates.push({} as never);
    }).toThrow(TypeError);
  });
});

describe("historical writes", () => {
  it("allows in-memory test mutations and rejects every other environment", () => {
    expect(historicalMutationAllowed("test")).toBe(true);
    expect(historicalMutationAllowed("development")).toBe(false);
    expect(historicalMutationAllowed("production")).toBe(false);
  });

  it("rejects a workflow mutation outside tests before changing memory", () => {
    const diagnosisBefore = WorkflowStore.getDiagnosis();
    vi.stubEnv("NODE_ENV", "development");
    try {
      expect(() =>
        WorkflowStore.submitDiagnosis({
          triggerId: "manual",
          evaluatorVersion: "v0.2.0",
          category: "other",
          observationNote: "must not persist",
          revalidationRequested: false,
          createdAt: "2026-10-21T00:00:00.000Z",
        }),
      ).toThrow(HistoricalWriteRejectedError);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(WorkflowStore.getDiagnosis()).toBe(diagnosisBefore);
  });

  it("rejects a run mutation outside tests before appending a run", () => {
    const countBefore = RunStore.getAllRuns().length;
    vi.stubEnv("NODE_ENV", "development");
    try {
      expect(() =>
        RunStore.createRun({
          type: "baseline",
          mode: "live",
          evaluatorVersion: "v0.2.0",
          rubricVersion: "rubric-v0.2",
          taxonomyVersion: "taxonomy-v0.1",
          model: "gpt-test",
          sampleIds: ["case-1"],
        }),
      ).toThrow(HistoricalWriteRejectedError);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(RunStore.getAllRuns()).toHaveLength(countBefore);
  });

  it("refuses to overwrite the historical JSON paths", () => {
    const workflowBefore = fs.existsSync(HISTORICAL_WORKFLOW_FILE)
      ? fs.readFileSync(HISTORICAL_WORKFLOW_FILE)
      : null;
    const runsBefore = fs.existsSync(HISTORICAL_RUNS_FILE)
      ? fs.readFileSync(HISTORICAL_RUNS_FILE)
      : null;

    expect(() => saveWorkflowStateTo({ touched: true }, HISTORICAL_WORKFLOW_FILE))
      .toThrow(HistoricalWriteRejectedError);
    expect(() => saveRunsTo([], HISTORICAL_RUNS_FILE))
      .toThrow(HistoricalWriteRejectedError);

    if (workflowBefore) {
      expect(fs.readFileSync(HISTORICAL_WORKFLOW_FILE).equals(workflowBefore)).toBe(true);
    } else {
      expect(fs.existsSync(HISTORICAL_WORKFLOW_FILE)).toBe(false);
    }
    if (runsBefore) {
      expect(fs.readFileSync(HISTORICAL_RUNS_FILE).equals(runsBefore)).toBe(true);
    } else {
      expect(fs.existsSync(HISTORICAL_RUNS_FILE)).toBe(false);
    }
  });
});

describe.skipIf(!historicalFilesPresent)("Run #0001 integrity manifest", () => {
  it("matches the versioned hashes and preserves the recorded calibration", () => {
    const workflowStat = fs.statSync(HISTORICAL_WORKFLOW_FILE);
    const runsStat = fs.statSync(HISTORICAL_RUNS_FILE);

    expect(sha256(HISTORICAL_WORKFLOW_FILE)).toBe(manifest.files["workflow-state.json"].sha256);
    expect(workflowStat.size).toBe(manifest.files["workflow-state.json"].bytes);
    expect(sha256(HISTORICAL_RUNS_FILE)).toBe(manifest.files["run-store.json"].sha256);
    expect(runsStat.size).toBe(manifest.files["run-store.json"].bytes);

    const workflow = JSON.parse(
      fs.readFileSync(HISTORICAL_WORKFLOW_FILE, "utf8"),
    ) as HistoricalWorkflowSource;
    const runs = JSON.parse(
      fs.readFileSync(HISTORICAL_RUNS_FILE, "utf8"),
    ) as EvaluationRun[];
    const experiment = readHistoricalExperiment(workflow, runs);
    const accepted = experiment.candidates.find((candidate) => candidate.status === "accepted");

    expect(experiment.candidates).toHaveLength(manifest.expected.candidates);
    expect(experiment.decisions).toHaveLength(manifest.expected.decisions);
    expect(experiment.interventions).toHaveLength(manifest.expected.interventions);
    expect(experiment.candidates.filter((candidate) => candidate.rubricText.length > 0))
      .toHaveLength(manifest.expected.rubricTexts);
    expect(experiment.runs).toHaveLength(manifest.expected.runs);
    expect(experiment.diagnosis?.id).toBe(manifest.expected.diagnosisId);
    expect(experiment.diagnosis?.status).toBe(manifest.expected.diagnosisStatus);
    expect(experiment.baselineRunId).toBe(manifest.expected.baselineRunId);
    expect(experiment.supersededVersion).toBe(manifest.expected.supersededVersion);
    expect(accepted?.attemptNumber).toBe(manifest.expected.acceptedAttempt);
    expect(accepted?.evaluatorVersion).toBe(manifest.expected.acceptedVersion);
    expect(experiment.runs.some((run) => run.runId === experiment.baselineRunId)).toBe(true);
  });
});
