import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildExperimentDashboard, experimentCaseDetail, experimentConfiguration } from "@/core/experiment-dashboard";
import { getDataset } from "@/data/datasets";
import { triggerConfigs } from "@/data/fixtures/triggers";
import {
  HISTORICAL_RUNS_FILE,
  HISTORICAL_WORKFLOW_FILE,
} from "@/data/historical-experiment";
import {
  createExperiment,
  getStoredExperiment,
  resetExperimentsForTests,
} from "@/data/experiment-store";
import {
  finishBaseline,
  getExperimentRun,
  loadExperimentRunStateFrom,
  recordBaselineCase,
  resetExperimentRunsForTests,
  saveExperimentRunStateTo,
  startBaseline,
} from "@/data/experiment-run-store";
import type { ExperimentBaselineRun, ExperimentCaseExecution, Label } from "@/core/types";

vi.mock("server-only", () => ({}));

const historicalFilesPresent =
  fs.existsSync(HISTORICAL_WORKFLOW_FILE) && fs.existsSync(HISTORICAL_RUNS_FILE);

function sha256(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function judgment(caseId: string, label: Label): ExperimentCaseExecution {
  return {
    caseId,
    status: "completed",
    label,
    rationale: `Rationale for ${caseId}`,
    latencyMs: 10,
    totalTokens: 20,
    attempts: 1,
  };
}

describe("named experiment dashboard", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_EVALUATOR_MODEL", "model-a");
    vi.stubEnv("OPENAI_EVALUATOR_MODEL_2", "model-b");
    resetExperimentsForTests();
    resetExperimentRunsForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps the completed demo baseline into representative metrics, triggers, and scoped evidence", () => {
    const experiment = createExperiment({
      name: "Demo dashboard",
      datasetId: "demo-10",
      modelId: "model-a",
      rubricMode: "existing",
      rubricVersion: "rubric-v0.2",
    });
    const started = startBaseline(getStoredExperiment(experiment.id)!);
    const dataset = getDataset("demo-10")!;
    const labels: Record<string, Label> = {
      "demo-rep-006": "FAIL",
    };
    for (const item of dataset.cases) {
      recordBaselineCase(started.runId, judgment(item.id, labels[item.id] ?? item.groundTruth));
    }
    const run = finishBaseline(started.runId);
    const view = buildExperimentDashboard(experiment, run, dataset, triggerConfigs);

    expect(view.measured).toBe(true);
    expect(view.demonstration).toBe(true);
    expect(view.representativeN).toBe(8);
    expect(view.targetedN).toBe(2);
    expect(view.profile.sampleN).toBe(8);
    expect(view.profile.overallAgreement).toBeCloseTo(0.875);
    expect(view.profile.perClass.FAIL.recall).toBe(1);
    expect(view.profile.perClass.FAIL.precision).toBeCloseTo(2 / 3);
    expect(view.profile.confusionMatrix).toMatchObject({ TP: 2, FP: 1, TN: 5, FN: 0 });
    expect(view.targeted).toMatchObject({ caught: 1, missed: 0, falseAlarms: 0, evaluated: 2 });
    expect(view.failRecallFired).toBe(false);
    expect(view.triggerResults.find((item) => item.config.id === "t-metric-overall")?.fired).toBe(false);
    expect(view.triggerResults.filter((item) => item.config.type === "change").every((item) => !item.fired)).toBe(true);
    expect(view.representativeEvidence).toHaveLength(8);
    expect(view.targetedEvidence).toHaveLength(2);
    expect(view.representativeEvidence.some((row) => row.caseId === "rep-001")).toBe(false);
    expect(experimentConfiguration(experiment)).toEqual(experimentConfiguration(experiment));

    const detail = experimentCaseDetail(experiment, run, dataset, "demo-rep-006");
    expect(detail?.result).toBe("FP");
    expect(detail?.content.evaluatorRationale).toContain("demo-rep-006");
    expect(experimentCaseDetail(experiment, run, dataset, "rep-001")).toBeNull();
  });

  it("fires the existing overall-agreement trigger without mixing historical cases", () => {
    const experiment = createExperiment({
      name: "Low agreement",
      datasetId: "demo-10",
      modelId: "model-a",
      rubricMode: "existing",
      rubricVersion: "rubric-v0.2",
    });
    const started = startBaseline(getStoredExperiment(experiment.id)!);
    const dataset = getDataset("demo-10")!;
    for (const item of dataset.cases) {
      const label: Label = item.sampleType === "representative" && item.groundTruth === "PASS"
        ? "FAIL"
        : item.groundTruth;
      recordBaselineCase(started.runId, judgment(item.id, label));
    }
    const run = finishBaseline(started.runId);
    const view = buildExperimentDashboard(experiment, run, dataset, triggerConfigs);
    const overall = view.triggerResults.find((item) => item.config.id === "t-metric-overall");
    expect(overall?.fired).toBe(true);
    expect(view.profile.sampleN).toBe(8);
    expect(view.representativeEvidence.map((row) => row.caseId).every((id) => id.startsWith("demo-"))).toBe(true);
    expect(view.targetedEvidence).toHaveLength(2);
  });

  it("reloads the same dashboard counts and leaves the historical files unchanged", () => {
    const before = historicalFilesPresent
      ? { workflow: sha256(HISTORICAL_WORKFLOW_FILE), runs: sha256(HISTORICAL_RUNS_FILE) }
      : null;
    const experiment = createExperiment({
      name: "Reload dashboard",
      datasetId: "demo-10",
      modelId: "model-a",
      rubricMode: "existing",
      rubricVersion: "rubric-v0.2",
    });
    const started = startBaseline(getStoredExperiment(experiment.id)!);
    recordBaselineCase(started.runId, judgment("demo-rep-001", "PASS"));
    const partial = getExperimentRun(started.runId)!;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jh-dashboard-"));
    const filePath = path.join(dir, "experiment-runs.json");
    saveExperimentRunStateTo({ runs: [partial] }, filePath);
    const loaded = loadExperimentRunStateFrom(filePath)?.runs[0] as ExperimentBaselineRun;
    const view = buildExperimentDashboard(experiment, loaded, getDataset("demo-10")!, triggerConfigs);
    expect(view.measured).toBe(false);
    expect(loaded.caseIds).toEqual(experiment.caseIds);
    expect(loaded.cases).toHaveLength(1);
    fs.rmSync(dir, { recursive: true, force: true });
    if (before) {
      expect(sha256(HISTORICAL_WORKFLOW_FILE)).toBe(before.workflow);
      expect(sha256(HISTORICAL_RUNS_FILE)).toBe(before.runs);
    }
  });
});
