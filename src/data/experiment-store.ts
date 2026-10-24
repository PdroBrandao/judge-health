import {
  EXPERIMENTS_FILE,
  loadExperiments,
  loadExperimentsFrom,
  saveExperiments,
  saveExperimentsTo,
  type ExperimentFileState,
} from "@/data/persistence";
import { HISTORICAL_EXPERIMENT_ID } from "@/data/historical-experiment";
import { getDataset } from "@/data/datasets";
import { DEFAULT_INFERENCE, EXISTING_RUBRICS, listConfiguredModelIds } from "@/data/evaluator-models";
import type {
  DiagnosisRecord,
  EvaluatorConfig,
  ExperimentRecord,
  ExperimentWorkflow,
  InterventionRecord,
  RevalidationDecision,
} from "@/core/types";

export interface CreateExperimentInput {
  name: string;
  datasetId: string;
  modelId: string;
  rubricMode: "existing" | "custom";
  rubricVersion?: string;
  rubricText?: string;
}

let memory: ExperimentFileState | null = null;
let loaded = false;

function emptyState(): ExperimentFileState {
  return { activeExperimentId: HISTORICAL_EXPERIMENT_ID, experiments: [] };
}

function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test";
}

function currentState(): ExperimentFileState {
  if (isTestEnv()) {
    if (!memory) memory = emptyState();
    return memory;
  }
  if (!loaded) {
    const loadedState = loadExperiments() ?? emptyState();
    memory = {
      ...loadedState,
      experiments: loadedState.experiments.map(normalizeExperiment),
    };
    loaded = true;
  }
  if (memory && memory.experiments.some((item) => !item.workflow?.diagnoses)) {
    memory = {
      ...memory,
      experiments: memory.experiments.map(normalizeExperiment),
    };
  }
  return memory ?? emptyState();
}

function commit(next: ExperimentFileState): void {
  memory = next;
  loaded = true;
  if (!isTestEnv()) saveExperiments(next);
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function emptyExperimentWorkflow(config: EvaluatorConfig): ExperimentWorkflow {
  return {
    diagnosis: null,
    diagnoses: [],
    interventions: [],
    decisions: [],
    currentInterventionId: null,
    configs: [config],
    currentCandidateConfigId: null,
    currentCandidateRunId: null,
  };
}

/** Fills workflow fields for experiments stored before diagnosis existed. */
export function normalizeExperiment(
  experiment: Omit<ExperimentRecord, "workflow"> & { workflow?: ExperimentWorkflow },
): ExperimentRecord {
  const workflow = experiment.workflow;
  const configs = workflow?.configs?.length ? workflow.configs : [experiment.config];
  const withBaseline = configs.some((item) => item.id === experiment.config.id)
    ? configs
    : [experiment.config, ...configs];
  const diagnosis = workflow?.diagnosis ?? null;
  const diagnoses = workflow?.diagnoses?.length
    ? workflow.diagnoses
    : diagnosis ? [diagnosis] : [];
  return {
    ...experiment,
    workflow: {
      diagnosis,
      diagnoses,
      interventions: workflow?.interventions ?? [],
      decisions: workflow?.decisions ?? [],
      currentInterventionId: workflow?.currentInterventionId ?? null,
      configs: withBaseline,
      currentCandidateConfigId: workflow?.currentCandidateConfigId ?? null,
      currentCandidateRunId: workflow?.currentCandidateRunId ?? null,
    },
  };
}

export function resetExperimentsForTests(): void {
  memory = emptyState();
  loaded = true;
}

export function getActiveExperimentId(): string {
  return currentState().activeExperimentId || HISTORICAL_EXPERIMENT_ID;
}

export function listStoredExperiments(): ExperimentRecord[] {
  return currentState().experiments;
}

export function getStoredExperiment(id: string): ExperimentRecord | undefined {
  return currentState().experiments.find((item) => item.id === id);
}

export type ActiveWorkspace =
  | { mode: "archived" }
  | { mode: "configured"; experiment: ExperimentRecord };

export function activeWorkspace(): ActiveWorkspace {
  const id = getActiveExperimentId();
  if (id === HISTORICAL_EXPERIMENT_ID) return { mode: "archived" };
  const experiment = getStoredExperiment(id);
  if (!experiment) return { mode: "archived" };
  return { mode: "configured", experiment };
}

export function attachBaselineRun(experimentId: string, runId: string): void {
  const state = currentState();
  const experiment = state.experiments.find((item) => item.id === experimentId);
  if (!experiment) throw new Error(`Unknown experiment: ${experimentId}`);
  if (experiment.baselineRunId && experiment.baselineRunId !== runId) {
    throw new Error("A baseline run is already recorded for this experiment.");
  }
  if (experiment.baselineRunId === runId) return;
  commit({
    ...state,
    experiments: state.experiments.map((item) => (
      item.id === experimentId ? { ...item, baselineRunId: runId } : item
    )),
  });
}

export function selectExperiment(id: string): void {
  if (id !== HISTORICAL_EXPERIMENT_ID && !getStoredExperiment(id)) {
    throw new Error(`Unknown experiment: ${id}`);
  }
  const state = currentState();
  commit({ ...state, activeExperimentId: id });
}

export function createExperiment(input: CreateExperimentInput): ExperimentRecord {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) {
    throw new Error("Experiment name must be 1–80 characters.");
  }
  const dataset = getDataset(input.datasetId);
  if (!dataset) throw new Error("Unknown dataset.");
  const allowedModels = listConfiguredModelIds();
  if (!allowedModels.includes(input.modelId)) {
    throw new Error("Model is not one of the configured models.");
  }

  let rubricText = "";
  let rubricVersion = "";
  if (input.rubricMode === "existing") {
    const rubric = EXISTING_RUBRICS.find((item) => item.version === input.rubricVersion);
    if (!rubric) throw new Error("Unknown rubric.");
    rubricText = rubric.text;
    rubricVersion = rubric.version;
  } else if (input.rubricMode === "custom") {
    rubricText = input.rubricText?.trim() ?? "";
    if (rubricText.length < 20) throw new Error("Custom rubric is too short.");
    rubricVersion = "custom";
  } else {
    throw new Error("Unknown rubric mode.");
  }

  const configId = `cfg-${uid()}`;
  const experiment: ExperimentRecord = {
    id: `exp-${uid()}`,
    name,
    status: "configured",
    datasetId: dataset.id,
    caseIds: dataset.cases.map((item) => item.id),
    baselineConfigId: configId,
    baselineRunId: null,
    createdAt: new Date().toISOString(),
    config: {
      id: configId,
      version: "config.1",
      modelId: input.modelId,
      rubricText,
      rubricVersion,
      inference: { ...DEFAULT_INFERENCE },
      parentConfigId: null,
    },
    workflow: emptyExperimentWorkflow({
      id: configId,
      version: "config.1",
      modelId: input.modelId,
      rubricText,
      rubricVersion,
      inference: { ...DEFAULT_INFERENCE },
      parentConfigId: null,
    }),
  };
  experiment.workflow.configs = [experiment.config];

  const state = currentState();
  commit({
    activeExperimentId: experiment.id,
    experiments: [...state.experiments, experiment],
  });
  return experiment;
}

/** Round-trip helper for tests. Writes only the caller-supplied path. */
export function saveExperimentStateTo(state: ExperimentFileState, filePath: string): void {
  saveExperimentsTo(state, filePath);
}

export function loadExperimentStateFrom(filePath: string): ExperimentFileState | null {
  const loaded = loadExperimentsFrom(filePath);
  if (!loaded) return null;
  return {
    ...loaded,
    experiments: loaded.experiments.map(normalizeExperiment),
  };
}

function replaceExperiment(experimentId: string, next: ExperimentRecord): ExperimentRecord {
  const state = currentState();
  if (!state.experiments.some((item) => item.id === experimentId)) {
    throw new Error(`Unknown experiment: ${experimentId}`);
  }
  commit({
    ...state,
    experiments: state.experiments.map((item) => (item.id === experimentId ? next : item)),
  });
  return next;
}

/**
 * Records a diagnosis on the named experiment.
 * An open diagnosis can be replaced. An intervention locks it.
 */
export function recordExperimentDiagnosis(
  experimentId: string,
  data: Omit<DiagnosisRecord, "id" | "status">,
): DiagnosisRecord {
  const experiment = getStoredExperiment(experimentId);
  if (!experiment) throw new Error(`Unknown experiment: ${experimentId}`);
  if (experiment.workflow.currentInterventionId) {
    throw new Error("The current diagnosis already has an intervention.");
  }
  const note = data.observationNote.trim();
  if (note.length < 10) throw new Error("Observation note must be at least 10 characters.");
  if (!data.triggerId.trim()) throw new Error("Diagnosis requires a trigger id or manual.");
  const record: DiagnosisRecord = {
    id: `dx-${uid()}`,
    ...data,
    observationNote: note,
    status: "open",
  };
  const diagnoses = experiment.workflow.diagnoses.filter((item) => !(
    item.status === "open" && item.id === experiment.workflow.diagnosis?.id
  ));
  replaceExperiment(experimentId, {
    ...experiment,
    workflow: {
      ...experiment.workflow,
      diagnosis: record,
      diagnoses: [...diagnoses, record],
    },
  });
  return record;
}

/**
 * Appends an intervention. A draft for the same diagnosis can be updated
 * so a failed follow-up save can be retried. The baseline config is not changed.
 */
export function recordExperimentIntervention(
  experimentId: string,
  data: Omit<InterventionRecord, "id" | "status" | "attemptNumber">,
): InterventionRecord {
  const experiment = getStoredExperiment(experimentId);
  if (!experiment) throw new Error(`Unknown experiment: ${experimentId}`);
  const diagnosis = experiment.workflow.diagnosis;
  if (!diagnosis || diagnosis.id !== data.diagnosisId) {
    throw new Error("An intervention requires the active diagnosis.");
  }
  if (data.rationale.trim().length < 10) throw new Error("Intervention rationale must be at least 10 characters.");
  if (data.proposedRubricText.trim().length < 20) throw new Error("Proposed rubric is too short.");
  const current = experiment.workflow.interventions.find(
    (item) => item.id === experiment.workflow.currentInterventionId,
  );
  if (current?.status === "candidate_created") {
    throw new Error("A candidate configuration is already recorded for this intervention.");
  }
  if (current && current.diagnosisId !== data.diagnosisId) {
    throw new Error("An intervention is already active.");
  }
  const record: InterventionRecord = current
    ? {
        ...current,
        proposedRubricText: data.proposedRubricText,
        rationale: data.rationale.trim(),
        baselineEvaluatorVersion: data.baselineEvaluatorVersion,
        baselineRubricVersion: data.baselineRubricVersion,
      }
    : {
        id: `int-${uid()}`,
        ...data,
        rationale: data.rationale.trim(),
        attemptNumber: experiment.workflow.interventions.length + 1,
        status: "draft",
      };
  replaceExperiment(experimentId, {
    ...experiment,
    config: experiment.config,
    baselineConfigId: experiment.baselineConfigId,
    workflow: {
      ...experiment.workflow,
      interventions: current
        ? experiment.workflow.interventions.map((item) => (item.id === current.id ? record : item))
        : [...experiment.workflow.interventions, record],
      currentInterventionId: record.id,
      diagnosis: { ...diagnosis, status: "intervention_created" },
      diagnoses: experiment.workflow.diagnoses.map((item) => (
        item.id === diagnosis.id ? { ...diagnosis, status: "intervention_created" as const } : item
      )),
    },
  });
  return record;
}

/**
 * Appends a candidate configuration. The baseline config object stays in place.
 * A second call returns the configuration already recorded.
 */
export function recordExperimentCandidateConfig(
  experimentId: string,
  data: { rubricText: string; rubricVersion: string },
): EvaluatorConfig {
  const experiment = getStoredExperiment(experimentId);
  if (!experiment) throw new Error(`Unknown experiment: ${experimentId}`);
  const interventionId = experiment.workflow.currentInterventionId;
  const intervention = experiment.workflow.interventions.find((item) => item.id === interventionId);
  if (!intervention) throw new Error("A candidate configuration requires an intervention.");
  const existing = experiment.workflow.configs.find(
    (item) => item.id === experiment.workflow.currentCandidateConfigId,
  );
  if (existing) return existing;
  const rubricText = data.rubricText.trim();
  if (rubricText.length < 20) throw new Error("Proposed rubric is too short.");
  const baseline = experiment.config;
  const candidate: EvaluatorConfig = {
    id: `cfg-${uid()}`,
    version: `config.${experiment.workflow.configs.length + 1}`,
    modelId: baseline.modelId,
    rubricText,
    rubricVersion: data.rubricVersion.trim() || `${baseline.rubricVersion}-proposed`,
    inference: { ...baseline.inference },
    parentConfigId: baseline.id,
  };
  replaceExperiment(experimentId, {
    ...experiment,
    config: baseline,
    baselineConfigId: experiment.baselineConfigId,
    baselineRunId: experiment.baselineRunId,
    workflow: {
      ...experiment.workflow,
      configs: [...experiment.workflow.configs, candidate],
      currentCandidateConfigId: candidate.id,
      interventions: experiment.workflow.interventions.map((item) => (
        item.id === intervention.id ? { ...item, status: "candidate_created" as const, proposedRubricText: rubricText } : item
      )),
    },
  });
  return candidate;
}

export function attachCandidateRun(experimentId: string, runId: string): void {
  const experiment = getStoredExperiment(experimentId);
  if (!experiment) throw new Error(`Unknown experiment: ${experimentId}`);
  if (!experiment.workflow.currentCandidateConfigId) {
    throw new Error("A candidate run requires a candidate configuration.");
  }
  const current = experiment.workflow.currentCandidateRunId;
  if (current && current !== runId) {
    throw new Error("A candidate run is already recorded for this attempt.");
  }
  if (current === runId) return;
  replaceExperiment(experimentId, {
    ...experiment,
    workflow: { ...experiment.workflow, currentCandidateRunId: runId },
  });
}

/**
 * Accept promotes the completed candidate to the logical baseline.
 * Reject keeps the baseline and opens another attempt.
 * The caller must already have verified that the candidate run is complete.
 */
export function applyExperimentDecision(
  experimentId: string,
  input: { decision: "accepted" | "rejected"; rationale: string; candidateVersion: string; baselineVersion: string },
): RevalidationDecision {
  const experiment = getStoredExperiment(experimentId);
  if (!experiment) throw new Error(`Unknown experiment: ${experimentId}`);
  const candidate = experiment.workflow.configs.find(
    (item) => item.id === experiment.workflow.currentCandidateConfigId,
  );
  if (!candidate || !experiment.workflow.currentCandidateRunId) {
    throw new Error("There is no candidate ready for a decision.");
  }
  const note = input.rationale.trim();
  if (note.length < 10) throw new Error("Decision rationale must be at least 10 characters.");
  const decision: RevalidationDecision = {
    id: `dec-${uid()}`,
    candidateId: candidate.id,
    candidateVersion: input.candidateVersion,
    baselineVersion: input.baselineVersion,
    decision: input.decision,
    rationale: note,
    decidedAt: new Date().toISOString(),
  };
  const accepted = input.decision === "accepted";
  const diagnosis = experiment.workflow.diagnosis
    ? {
        ...experiment.workflow.diagnosis,
        status: accepted ? "resolved" as const : "open" as const,
      }
    : null;
  replaceExperiment(experimentId, {
    ...experiment,
    config: accepted ? candidate : experiment.config,
    baselineConfigId: accepted ? candidate.id : experiment.baselineConfigId,
    baselineRunId: accepted ? experiment.workflow.currentCandidateRunId : experiment.baselineRunId,
    workflow: {
      ...experiment.workflow,
      diagnosis,
      diagnoses: experiment.workflow.diagnoses.map((item) => (
        diagnosis && item.id === diagnosis.id ? diagnosis : item
      )),
      decisions: [...experiment.workflow.decisions, decision],
      currentInterventionId: null,
      currentCandidateConfigId: null,
      currentCandidateRunId: null,
    },
  });
  return decision;
}

export function experimentsFilePath(): string {
  return EXPERIMENTS_FILE;
}
