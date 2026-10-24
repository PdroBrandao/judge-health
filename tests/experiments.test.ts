import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVE_RUBRIC_TEXT } from "@/data/rubric-text";
import { getDataset } from "@/data/datasets";
import {
  HISTORICAL_RUNS_FILE,
  HISTORICAL_WORKFLOW_FILE,
} from "@/data/historical-experiment";
import {
  activeWorkspace,
  createExperiment,
  experimentsFilePath,
  getActiveExperimentId,
  loadExperimentStateFrom,
  resetExperimentsForTests,
  saveExperimentStateTo,
  selectExperiment,
} from "@/data/experiment-store";
import { DEFAULT_INFERENCE } from "@/data/evaluator-models";

vi.mock("server-only", () => ({}));

const historicalFilesPresent =
  fs.existsSync(HISTORICAL_WORKFLOW_FILE) && fs.existsSync(HISTORICAL_RUNS_FILE);

function sha256(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

describe("named experiments", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jh-experiments-"));
    vi.stubEnv("OPENAI_EVALUATOR_MODEL", "model-a");
    vi.stubEnv("OPENAI_EVALUATOR_MODEL_2", "model-b");
    resetExperimentsForTests();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("starts on the archived experiment and stores new experiments in a separate file", () => {
    expect(getActiveExperimentId()).toBe("run-0001");
    expect(activeWorkspace().mode).toBe("archived");
    expect(path.basename(experimentsFilePath())).toBe("active-experiments.json");
    expect(experimentsFilePath()).not.toBe(HISTORICAL_WORKFLOW_FILE);
    expect(experimentsFilePath()).not.toBe(HISTORICAL_RUNS_FILE);
  });

  it("freezes the chosen dataset and evaluator configuration", () => {
    const historical = createExperiment({
      name: "Historical check",
      datasetId: "historical-70",
      modelId: "model-b",
      rubricMode: "existing",
      rubricVersion: "rubric-v0.2",
    });
    const demo = createExperiment({
      name: "Demo check",
      datasetId: "demo-10",
      modelId: "model-a",
      rubricMode: "custom",
      rubricText: "Custom rubric text that is long enough to store.",
    });

    expect(historical.caseIds).toEqual(getDataset("historical-70")!.cases.map((item) => item.id));
    expect(historical.caseIds).toHaveLength(70);
    expect(historical.config.modelId).toBe("model-b");
    expect(historical.config.rubricText).toBe(ACTIVE_RUBRIC_TEXT);
    expect(historical.config.rubricVersion).toBe("rubric-v0.2");
    expect(historical.config.version).toBe("config.1");
    expect(historical.config.inference).toEqual(DEFAULT_INFERENCE);
    expect(historical.baselineRunId).toBeNull();
    expect(JSON.stringify(historical)).not.toContain("groundTruth");

    expect(demo.caseIds).toEqual(getDataset("demo-10")!.cases.map((item) => item.id));
    expect(demo.caseIds).toHaveLength(10);
    expect(demo.config.rubricVersion).toBe("custom");
    expect(demo.datasetId).toBe("demo-10");
    expect(getActiveExperimentId()).toBe(demo.id);
  });

  it("keeps dataset and evaluator configuration after reload", () => {
    const created = createExperiment({
      name: "Reload me",
      datasetId: "demo-10",
      modelId: "model-a",
      rubricMode: "existing",
      rubricVersion: "rubric-v0.2",
    });
    const filePath = path.join(tmpDir, "active-experiments.json");
    saveExperimentStateTo({
      activeExperimentId: created.id,
      experiments: [created],
    }, filePath);

    const loaded = loadExperimentStateFrom(filePath);
    expect(loaded?.activeExperimentId).toBe(created.id);
    expect(loaded?.experiments[0]).toEqual(created);
    expect(loaded?.experiments[0].datasetId).toBe("demo-10");
    expect(loaded?.experiments[0].caseIds).toEqual(created.caseIds);
    expect(loaded?.experiments[0].config.modelId).toBe("model-a");
    expect(loaded?.experiments[0].config.rubricText).toBe(ACTIVE_RUBRIC_TEXT);
    expect(loaded?.experiments[0].config.inference).toEqual(DEFAULT_INFERENCE);
  });

  it("rejects models outside the two configured slots", () => {
    expect(() => createExperiment({
      name: "Bad model",
      datasetId: "demo-10",
      modelId: "not-configured",
      rubricMode: "existing",
      rubricVersion: "rubric-v0.2",
    })).toThrow(/configured models/);
  });

  it("can select the archive again without turning it into a stored experiment", () => {
    const created = createExperiment({
      name: "Switch back",
      datasetId: "demo-10",
      modelId: "model-a",
      rubricMode: "existing",
      rubricVersion: "rubric-v0.2",
    });
    selectExperiment("run-0001");
    expect(getActiveExperimentId()).toBe("run-0001");
    expect(activeWorkspace().mode).toBe("archived");
    selectExperiment(created.id);
    expect(activeWorkspace()).toEqual({ mode: "configured", experiment: created });
  });

  it("refuses to write the historical JSON files", () => {
    const before = historicalFilesPresent
      ? {
          workflow: sha256(HISTORICAL_WORKFLOW_FILE),
          runs: sha256(HISTORICAL_RUNS_FILE),
        }
      : null;
    expect(() => saveExperimentStateTo(
      { activeExperimentId: "run-0001", experiments: [] },
      HISTORICAL_WORKFLOW_FILE,
    )).toThrow(/read-only/i);
    expect(() => saveExperimentStateTo(
      { activeExperimentId: "run-0001", experiments: [] },
      HISTORICAL_RUNS_FILE,
    )).toThrow(/read-only/i);
    if (before) {
      expect(sha256(HISTORICAL_WORKFLOW_FILE)).toBe(before.workflow);
      expect(sha256(HISTORICAL_RUNS_FILE)).toBe(before.runs);
    }
  });
});
