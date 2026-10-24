import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildExperimentDashboard } from "@/core/experiment-dashboard";
import type { ExperimentCaseExecution, ExperimentRecord, Label } from "@/core/types";
import { getDataset } from "@/data/datasets";
import { triggerConfigs } from "@/data/fixtures/triggers";
import {
  HISTORICAL_RUNS_FILE,
  HISTORICAL_WORKFLOW_FILE,
} from "@/data/historical-experiment";
import {
  createExperiment,
  getStoredExperiment,
  loadExperimentStateFrom,
  resetExperimentsForTests,
  saveExperimentStateTo,
  selectExperiment,
} from "@/data/experiment-store";
import {
  finishBaseline,
  getBaselineRunForExperiment,
  getExperimentRun,
  recordBaselineCase,
  resetExperimentRunsForTests,
  startBaseline,
  startCandidateRun,
} from "@/data/experiment-run-store";
import {
  decideExperimentCandidate,
  submitExperimentCandidateConfig,
  submitExperimentDiagnosis,
  submitExperimentIntervention,
} from "@/data/experiment-workflow";
import { WorkflowStore } from "@/data/workflow-store";

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

function completedDemo(name: string): ExperimentRecord {
  const experiment = createExperiment({
    name,
    datasetId: "demo-10",
    modelId: "model-a",
    rubricMode: "existing",
    rubricVersion: "rubric-v0.2",
  });
  const started = startBaseline(getStoredExperiment(experiment.id)!);
  const dataset = getDataset("demo-10")!;
  for (const item of dataset.cases) {
    const label: Label = item.id === "demo-rep-006" ? "FAIL" : item.groundTruth;
    recordBaselineCase(started.runId, judgment(item.id, label));
  }
  finishBaseline(started.runId);
  return getStoredExperiment(experiment.id)!;
}

describe("named experiment diagnosis and intervention", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_EVALUATOR_MODEL", "model-a");
    vi.stubEnv("OPENAI_EVALUATOR_MODEL_2", "model-b");
    resetExperimentsForTests();
    resetExperimentRunsForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("records a manual diagnosis when no metric trigger fires, and keeps it after reload", () => {
    const experiment = completedDemo("Manual diagnosis");
    const dataset = getDataset("demo-10")!;
    const runView = buildExperimentDashboard(
      experiment,
      getBaselineRunForExperiment(experiment.id)!,
      dataset,
      triggerConfigs,
    );
    expect(runView.profile.overallAgreement).toBeCloseTo(0.875);
    expect(runView.triggerResults.filter((item) => item.config.type === "metric").every((item) => !item.fired)).toBe(true);

    const diagnosis = submitExperimentDiagnosis(experiment.id, {
      triggerId: "manual",
      evaluatorVersion: experiment.config.version,
      category: "evaluator_rubric",
      observationNote: "Representative false positive on demo-rep-006.",
      revalidationRequested: true,
      createdAt: "2026-10-21T00:00:00.000Z",
    });
    expect(diagnosis.triggerId).toBe("manual");
    expect(diagnosis.status).toBe("open");

    const stored = getStoredExperiment(experiment.id)!;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jh-workflow-"));
    const filePath = path.join(dir, "active-experiments.json");
    saveExperimentStateTo({ activeExperimentId: stored.id, experiments: [stored] }, filePath);
    const loaded = loadExperimentStateFrom(filePath);
    expect(loaded?.experiments[0].workflow.diagnosis?.id).toBe(diagnosis.id);
    expect(loaded?.experiments[0].workflow.diagnosis?.triggerId).toBe("manual");
    expect(loaded?.experiments[0].config.rubricText).toBe(experiment.config.rubricText);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("creates a child configuration and leaves the baseline untouched", () => {
    const experiment = completedDemo("Candidate version");
    const baselineText = experiment.config.rubricText;
    const baselineId = experiment.config.id;
    const diagnosis = submitExperimentDiagnosis(experiment.id, {
      triggerId: "manual",
      evaluatorVersion: experiment.config.version,
      category: "evaluator_rubric",
      observationNote: "The false positive suggests a rubric gap.",
      revalidationRequested: true,
      createdAt: "2026-10-21T00:00:00.000Z",
    });
    const proposed = `${baselineText}\n\nAdditional FAIL criterion for the observed false positive.`;
    const intervention = submitExperimentIntervention(experiment.id, {
      diagnosisId: diagnosis.id,
      baselineEvaluatorVersion: experiment.config.version,
      baselineRubricVersion: experiment.config.rubricVersion,
      proposedRubricText: proposed,
      rationale: "Tighten the rubric around the false positive pattern.",
      createdAt: "2026-10-21T00:01:00.000Z",
    });
    const candidate = submitExperimentCandidateConfig(experiment.id, {
      rubricText: proposed,
      rubricVersion: "rubric-v0.2-proposed",
    });
    const stored = getStoredExperiment(experiment.id)!;

    expect(intervention.attemptNumber).toBe(1);
    expect(candidate.version).toBe("config.2");
    expect(candidate.parentConfigId).toBe(baselineId);
    expect(candidate.rubricText).toBe(proposed.trim());
    expect(stored.config.id).toBe(baselineId);
    expect(stored.config.version).toBe("config.1");
    expect(stored.config.rubricText).toBe(baselineText);
    expect(stored.baselineConfigId).toBe(baselineId);
    expect(stored.workflow.configs).toHaveLength(2);
    expect(stored.workflow.configs[0].id).toBe(baselineId);
    expect(stored.workflow.currentCandidateConfigId).toBe(candidate.id);
    expect(stored.workflow.interventions[0].status).toBe("candidate_created");
    expect(stored.workflow.diagnosis?.status).toBe("intervention_created");
    expect(submitExperimentCandidateConfig(experiment.id, {
      rubricText: proposed,
      rubricVersion: "rubric-v0.2-proposed",
    }).id).toBe(candidate.id);
    expect(() => submitExperimentIntervention(experiment.id, {
      diagnosisId: diagnosis.id,
      baselineEvaluatorVersion: experiment.config.version,
      baselineRubricVersion: experiment.config.rubricVersion,
      proposedRubricText: proposed,
      rationale: "A second intervention should wait for the next cycle.",
      createdAt: "2026-10-21T00:02:00.000Z",
    })).toThrow(/already recorded/);
  });

  it("keeps diagnoses inside the experiment that recorded them", () => {
    const first = completedDemo("Experiment A");
    const second = completedDemo("Experiment B");
    submitExperimentDiagnosis(first.id, {
      triggerId: "manual",
      evaluatorVersion: first.config.version,
      category: "other",
      observationNote: "Only experiment A should carry this note.",
      revalidationRequested: true,
      createdAt: "2026-10-21T00:00:00.000Z",
    });
    selectExperiment(second.id);
    expect(getStoredExperiment(second.id)?.workflow.diagnosis).toBeNull();
    expect(getStoredExperiment(first.id)?.workflow.diagnosis?.observationNote).toContain("experiment A");
    expect(getStoredExperiment(first.id)?.config.rubricText).toBe(getStoredExperiment(second.id)?.config.rubricText);
  });

  it("refuses a diagnosis before the baseline is complete and does not touch Run #0001", () => {
    const before = historicalFilesPresent
      ? { workflow: sha256(HISTORICAL_WORKFLOW_FILE), runs: sha256(HISTORICAL_RUNS_FILE) }
      : null;
    const experiment = createExperiment({
      name: "Incomplete",
      datasetId: "demo-10",
      modelId: "model-a",
      rubricMode: "existing",
      rubricVersion: "rubric-v0.2",
    });
    startBaseline(getStoredExperiment(experiment.id)!);
    expect(() => submitExperimentDiagnosis(experiment.id, {
      triggerId: "manual",
      evaluatorVersion: "config.1",
      category: "other",
      observationNote: "This baseline is still running and cannot be diagnosed.",
      revalidationRequested: false,
      createdAt: "2026-10-21T00:00:00.000Z",
    })).toThrow(/completed baseline/);
    expect(WorkflowStore.getDiagnosis()).toBeNull();
    expect(() => submitExperimentIntervention(experiment.id, {
      diagnosisId: "missing",
      baselineEvaluatorVersion: "config.1",
      baselineRubricVersion: "rubric-v0.2",
      proposedRubricText: "A proposed rubric that is long enough to store.",
      rationale: "Should not be stored without a diagnosis.",
      createdAt: "2026-10-21T00:00:00.000Z",
    })).toThrow(/completed baseline/);
    if (before) {
      expect(sha256(HISTORICAL_WORKFLOW_FILE)).toBe(before.workflow);
      expect(sha256(HISTORICAL_RUNS_FILE)).toBe(before.runs);
    }
  });

  it("loads an experiment saved before workflow fields existed", () => {
    const experiment = completedDemo("Legacy shape");
    const legacy = { ...experiment } as Partial<ExperimentRecord> & Pick<ExperimentRecord, "config" | "id">;
    delete legacy.workflow;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jh-legacy-exp-"));
    const filePath = path.join(dir, "active-experiments.json");
    saveExperimentStateTo({
      activeExperimentId: experiment.id,
      experiments: [legacy as ExperimentRecord],
    }, filePath);
    const loaded = loadExperimentStateFrom(filePath)?.experiments[0];
    expect(loaded?.workflow.diagnosis).toBeNull();
    expect(loaded?.workflow.configs[0].id).toBe(experiment.config.id);
    expect(loaded?.config.version).toBe("config.1");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("evaluates a candidate on the frozen cases, compares it, and keeps the baseline on rejection", () => {
    const before = historicalFilesPresent
      ? { workflow: sha256(HISTORICAL_WORKFLOW_FILE), runs: sha256(HISTORICAL_RUNS_FILE) }
      : null;
    const experiment = completedDemo("Candidate cycle");
    const baselineRunId = experiment.baselineRunId;
    const baselineId = experiment.config.id;
    const diagnosis = submitExperimentDiagnosis(experiment.id, {
      triggerId: "manual",
      evaluatorVersion: experiment.config.version,
      category: "evaluator_rubric",
      observationNote: "False positive on the representative case.",
      revalidationRequested: true,
      createdAt: "2026-10-21T00:00:00.000Z",
    });
    const proposed = `${experiment.config.rubricText}\n\nCandidate-only criterion.`;
    submitExperimentIntervention(experiment.id, {
      diagnosisId: diagnosis.id,
      baselineEvaluatorVersion: "config.1",
      baselineRubricVersion: "rubric-v0.2",
      proposedRubricText: proposed,
      rationale: "Address the representative false positive.",
      createdAt: "2026-10-21T00:01:00.000Z",
    });
    const config = submitExperimentCandidateConfig(experiment.id, {
      rubricText: proposed,
      rubricVersion: "rubric-v0.2-proposed",
    });
    const started = startCandidateRun(getStoredExperiment(experiment.id)!, config.id);
    expect(started.caseIds).toEqual(experiment.caseIds);
    expect(started.role).toBe("candidate");
    expect(started.configId).toBe(config.id);
    expect(startCandidateRun(getStoredExperiment(experiment.id)!, config.id).runId).toBe(started.runId);
    expect(getBaselineRunForExperiment(experiment.id)?.runId).toBe(baselineRunId);

    const dataset = getDataset("demo-10")!;
    recordBaselineCase(started.runId, judgment("demo-rep-001", "PASS"));
    expect(() => decideExperimentCandidate(experiment.id, {
      decision: "accepted",
      rationale: "This incomplete run must not be promoted.",
      candidateVersion: config.version,
      baselineVersion: "config.1",
    })).toThrow(/completed/);

    for (const item of dataset.cases) {
      recordBaselineCase(started.runId, judgment(item.id, item.groundTruth));
    }
    const finished = finishBaseline(started.runId);
    expect(finished.status).toBe("completed");
    const baselineView = buildExperimentDashboard(experiment, getBaselineRunForExperiment(experiment.id)!, dataset, triggerConfigs);
    const candidateView = buildExperimentDashboard(
      { ...getStoredExperiment(experiment.id)!, config },
      finished,
      dataset,
      triggerConfigs,
    );
    expect(candidateView.profile.confusionMatrix.FP).toBe(0);
    expect(baselineView.profile.confusionMatrix.FP).toBe(1);
    expect(candidateView.profile.overallAgreement).toBeGreaterThan(baselineView.profile.overallAgreement);

    decideExperimentCandidate(experiment.id, {
      decision: "rejected",
      rationale: "Keep the original baseline for another attempt.",
      candidateVersion: config.version,
      baselineVersion: "config.1",
    });
    const rejected = getStoredExperiment(experiment.id)!;
    expect(rejected.config.id).toBe(baselineId);
    expect(rejected.baselineRunId).toBe(baselineRunId);
    expect(rejected.workflow.currentCandidateConfigId).toBeNull();
    expect(rejected.workflow.decisions[0].decision).toBe("rejected");
    expect(getExperimentRun(baselineRunId!)?.status).toBe("completed");
    expect(getExperimentRun(started.runId)?.status).toBe("completed");
    if (before) {
      expect(sha256(HISTORICAL_WORKFLOW_FILE)).toBe(before.workflow);
      expect(sha256(HISTORICAL_RUNS_FILE)).toBe(before.runs);
    }
  });

  it("promotes a completed candidate and opens another cycle without touching the other experiment", () => {
    const experiment = completedDemo("Promotion");
    const other = completedDemo("Untouched");
    const originalRun = experiment.baselineRunId!;
    const diagnosis = submitExperimentDiagnosis(experiment.id, {
      triggerId: "manual",
      evaluatorVersion: "config.1",
      category: "evaluator_rubric",
      observationNote: "Promote the corrected rubric after a full run.",
      revalidationRequested: true,
      createdAt: "2026-10-21T00:00:00.000Z",
    });
    const proposed = `${experiment.config.rubricText}\n\nPromoted criterion.`;
    submitExperimentIntervention(experiment.id, {
      diagnosisId: diagnosis.id,
      baselineEvaluatorVersion: "config.1",
      baselineRubricVersion: "rubric-v0.2",
      proposedRubricText: proposed,
      rationale: "The corrected rubric should become the baseline.",
      createdAt: "2026-10-21T00:01:00.000Z",
    });
    const config = submitExperimentCandidateConfig(experiment.id, {
      rubricText: proposed,
      rubricVersion: "rubric-v0.2-proposed",
    });
    const run = startCandidateRun(getStoredExperiment(experiment.id)!, config.id);
    for (const item of getDataset("demo-10")!.cases) {
      recordBaselineCase(run.runId, judgment(item.id, item.groundTruth));
    }
    finishBaseline(run.runId);
    decideExperimentCandidate(experiment.id, {
      decision: "accepted",
      rationale: "The candidate corrected the false positive.",
      candidateVersion: config.version,
      baselineVersion: "config.1",
    });
    const promoted = getStoredExperiment(experiment.id)!;
    expect(promoted.config.id).toBe(config.id);
    expect(promoted.config.version).toBe("config.2");
    expect(promoted.config.parentConfigId).toBe(experiment.config.id);
    expect(promoted.baselineRunId).toBe(run.runId);
    expect(getExperimentRun(originalRun)?.configVersion).toBe("config.1");
    expect(promoted.workflow.diagnosis?.status).toBe("resolved");
    expect(getStoredExperiment(other.id)?.config.version).toBe("config.1");
    expect(getStoredExperiment(other.id)?.workflow.decisions).toEqual([]);

    const next = submitExperimentDiagnosis(experiment.id, {
      triggerId: "manual",
      evaluatorVersion: promoted.config.version,
      category: "other",
      observationNote: "A second cycle can start from the promoted baseline.",
      revalidationRequested: true,
      createdAt: "2026-10-21T00:02:00.000Z",
    });
    expect(next.status).toBe("open");
    expect(getStoredExperiment(experiment.id)?.workflow.diagnoses).toHaveLength(2);
    expect(getStoredExperiment(experiment.id)?.config.version).toBe("config.2");
  });
});
