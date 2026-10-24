// ============================================================
// Read-only view of Calibration Run #0001.
//
// The historical JSON files stay the source of truth.
// This module never writes them. Mutating operations throw
// before memory or disk changes, except during unit tests,
// which keep their in-memory stores and must not touch
// experiment-data/.
// ============================================================
import path from "path";
import type {
  CandidateRecord,
  DiagnosisRecord,
  EvaluationRun,
  InterventionRecord,
  RevalidationDecision,
} from "@/core/types";

export const HISTORICAL_EXPERIMENT_ID = "run-0001" as const;

export const HISTORICAL_WORKFLOW_FILE = path.join(
  process.cwd(),
  "experiment-data",
  "workflow-state.json",
);

export const HISTORICAL_RUNS_FILE = path.join(
  process.cwd(),
  "experiment-data",
  "run-store.json",
);

export class HistoricalWriteRejectedError extends Error {
  constructor(operation: string) {
    super(`Run #0001 is read-only. Refusing to ${operation}.`);
    this.name = "HistoricalWriteRejectedError";
  }
}

export interface HistoricalWorkflowSource {
  diagnosis: DiagnosisRecord | null;
  interventions: InterventionRecord[];
  candidates: CandidateRecord[];
  decisions: RevalidationDecision[];
  baselineRunId: string | null;
  supersededVersion: string | null;
}

export interface HistoricalExperiment {
  id: typeof HISTORICAL_EXPERIMENT_ID;
  status: "archived";
  readOnly: true;
  baselineRunId: string | null;
  supersededVersion: string | null;
  diagnosis: DiagnosisRecord | null;
  interventions: InterventionRecord[];
  candidates: CandidateRecord[];
  decisions: RevalidationDecision[];
  runs: EvaluationRun[];
}

/** Unit tests are the only callers allowed to mutate the in-memory stores. */
export function historicalMutationAllowed(env = process.env.NODE_ENV): boolean {
  return env === "test";
}

export function assertHistoricalExperimentWritable(operation: string): void {
  if (historicalMutationAllowed()) return;
  throw new HistoricalWriteRejectedError(operation);
}

export function isHistoricalArtifactPath(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  return [HISTORICAL_WORKFLOW_FILE, HISTORICAL_RUNS_FILE].some((historical) => {
    const target = path.resolve(historical);
    return resolved === target || resolved === `${target}.tmp`;
  });
}

/** Reject any write or delete of the two original historical files. */
export function rejectHistoricalArtifactWrite(filePath: string): void {
  if (!isHistoricalArtifactPath(filePath)) return;
  throw new HistoricalWriteRejectedError(`write ${path.basename(filePath)}`);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

/** Copy the persisted records into a frozen archived experiment. */
export function readHistoricalExperiment(
  workflow: HistoricalWorkflowSource,
  runs: EvaluationRun[],
): HistoricalExperiment {
  return deepFreeze({
    id: HISTORICAL_EXPERIMENT_ID,
    status: "archived",
    readOnly: true,
    baselineRunId: workflow.baselineRunId,
    supersededVersion: workflow.supersededVersion,
    diagnosis: structuredClone(workflow.diagnosis),
    interventions: structuredClone(workflow.interventions),
    candidates: structuredClone(workflow.candidates),
    decisions: structuredClone(workflow.decisions),
    runs: structuredClone(runs),
  });
}
