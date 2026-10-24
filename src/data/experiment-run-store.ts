import {
  EXPERIMENT_RUNS_FILE,
  loadExperimentRuns,
  loadExperimentRunsFrom,
  saveExperimentRuns,
  saveExperimentRunsTo,
  type ExperimentRunFileState,
} from "@/data/persistence";
import { attachBaselineRun, attachCandidateRun, getStoredExperiment } from "@/data/experiment-store";
import type { ExperimentBaselineRun, ExperimentCaseExecution, ExperimentRecord } from "@/core/types";

export class DuplicateBaselineError extends Error {
  constructor() {
    super("A baseline run already exists for this experiment.");
    this.name = "DuplicateBaselineError";
  }
}

let memory: ExperimentRunFileState | null = null;
let loaded = false;

function emptyState(): ExperimentRunFileState {
  return { runs: [] };
}

function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test";
}

function currentState(): ExperimentRunFileState {
  if (isTestEnv()) {
    if (!memory) memory = emptyState();
    return memory;
  }
  if (!loaded) {
    memory = loadExperimentRuns() ?? emptyState();
    loaded = true;
  }
  return memory ?? emptyState();
}

function commit(next: ExperimentRunFileState): void {
  memory = next;
  loaded = true;
  if (!isTestEnv()) saveExperimentRuns(next);
}

function uid(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function resetExperimentRunsForTests(): void {
  memory = emptyState();
  loaded = true;
}

export function listExperimentRuns(): ExperimentBaselineRun[] {
  return currentState().runs;
}

export function getExperimentRun(runId: string): ExperimentBaselineRun | undefined {
  return currentState().runs.find((run) => run.runId === runId);
}

export function getBaselineRunForExperiment(experimentId: string): ExperimentBaselineRun | undefined {
  const experiment = getStoredExperiment(experimentId);
  if (experiment?.baselineRunId) {
    const linked = currentState().runs.find((run) => run.runId === experiment.baselineRunId);
    if (linked) return linked;
  }
  return currentState().runs.find((run) => run.experimentId === experimentId && run.role !== "candidate");
}

export function getCandidateRunForExperiment(experimentId: string): ExperimentBaselineRun | undefined {
  const experiment = getStoredExperiment(experimentId);
  const runId = experiment?.workflow.currentCandidateRunId;
  if (!runId) return undefined;
  return getExperimentRun(runId);
}

export function startBaseline(experiment: ExperimentRecord): ExperimentBaselineRun {
  if (experiment.baselineRunId || getBaselineRunForExperiment(experiment.id)) {
    throw new DuplicateBaselineError();
  }
  const run: ExperimentBaselineRun = {
    runId: uid(),
    experimentId: experiment.id,
    configId: experiment.config.id,
    datasetId: experiment.datasetId,
    caseIds: [...experiment.caseIds],
    modelId: experiment.config.modelId,
    rubricVersion: experiment.config.rubricVersion,
    configVersion: experiment.config.version,
    inference: { ...experiment.config.inference },
    mode: "live",
    role: "baseline",
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: null,
    cases: [],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
  attachBaselineRun(experiment.id, run.runId);
  commit({ runs: [...currentState().runs, run] });
  return run;
}

/** Starts one candidate run for the current configuration. A repeat returns that run. */
export function startCandidateRun(experiment: ExperimentRecord, configId: string): ExperimentBaselineRun {
  const current = getStoredExperiment(experiment.id) ?? experiment;
  if (current.workflow.currentCandidateRunId) {
    const existing = getExperimentRun(current.workflow.currentCandidateRunId);
    if (existing) return existing;
  }
  const config = current.workflow.configs.find((item) => item.id === configId);
  if (!config || config.id === current.config.id) {
    throw new Error("Candidate evaluation requires a new configuration.");
  }
  const run: ExperimentBaselineRun = {
    runId: uid(),
    experimentId: current.id,
    configId: config.id,
    datasetId: current.datasetId,
    caseIds: [...current.caseIds],
    modelId: config.modelId,
    rubricVersion: config.rubricVersion,
    configVersion: config.version,
    inference: { ...config.inference },
    mode: "live",
    role: "candidate",
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: null,
    cases: [],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
  commit({ runs: [...currentState().runs, run] });
  try {
    attachCandidateRun(current.id, run.runId);
  } catch (err) {
    const winner = getCandidateRunForExperiment(current.id);
    if (winner) return winner;
    throw err;
  }
  return run;
}

export function recordBaselineCase(runId: string, execution: ExperimentCaseExecution): ExperimentBaselineRun {
  const run = getExperimentRun(runId);
  if (!run) throw new Error(`Baseline run ${runId} was not found.`);
  if (run.status === "completed") throw new Error("The completed baseline cannot accept more judgments.");
  if (!run.caseIds.includes(execution.caseId)) {
    throw new Error(`Case ${execution.caseId} is not in this baseline.`);
  }
  const cases = [
    ...run.cases.filter((item) => item.caseId !== execution.caseId),
    execution,
  ];
  const updated: ExperimentBaselineRun = {
    ...run,
    status: "running",
    completedAt: null,
    cases,
    usage: sumUsage(cases),
  };
  replaceRun(updated);
  return updated;
}

export function finishBaseline(runId: string): ExperimentBaselineRun {
  const run = getExperimentRun(runId);
  if (!run) throw new Error(`Baseline run ${runId} was not found.`);
  if (run.status === "completed") return run;
  const byId = new Map(run.cases.map((item) => [item.caseId, item]));
  const completed = run.caseIds.filter((id) => byId.get(id)?.status === "completed").length;
  const failed = run.caseIds.filter((id) => byId.get(id)?.status === "failed").length;
  const pending = run.caseIds.length - completed - failed;
  let status: ExperimentBaselineRun["status"] = "running";
  if (pending === 0 && failed === 0 && completed === run.caseIds.length) status = "completed";
  else if (pending === 0 && completed === 0) status = "failed";
  else if (pending === 0) status = "partial_failure";
  const updated: ExperimentBaselineRun = {
    ...run,
    status,
    completedAt: status === "running" ? null : new Date().toISOString(),
  };
  replaceRun(updated);
  return updated;
}

export function saveExperimentRunStateTo(state: ExperimentRunFileState, filePath: string): void {
  saveExperimentRunsTo(state, filePath);
}

export function loadExperimentRunStateFrom(filePath: string): ExperimentRunFileState | null {
  return loadExperimentRunsFrom(filePath);
}

export function experimentRunsFilePath(): string {
  return EXPERIMENT_RUNS_FILE;
}

function replaceRun(run: ExperimentBaselineRun): void {
  const state = currentState();
  commit({
    runs: state.runs.map((item) => (item.runId === run.runId ? run : item)),
  });
}

function sumUsage(cases: ExperimentCaseExecution[]): ExperimentBaselineRun["usage"] {
  return cases.reduce((total, item) => ({
    promptTokens: total.promptTokens + (item.promptTokens ?? 0),
    completionTokens: total.completionTokens + (item.completionTokens ?? 0),
    totalTokens: total.totalTokens + (item.totalTokens ?? 0),
  }), { promptTokens: 0, completionTokens: 0, totalTokens: 0 });
}
