import { getBaselineRunForExperiment, getExperimentRun } from "@/data/experiment-run-store";
import {
  applyExperimentDecision,
  getStoredExperiment,
  recordExperimentCandidateConfig,
  recordExperimentDiagnosis,
  recordExperimentIntervention,
} from "@/data/experiment-store";
import type {
  DiagnosisRecord,
  EvaluatorConfig,
  InterventionRecord,
  RevalidationDecision,
} from "@/core/types";

function assertCompletedBaseline(experimentId: string): void {
  const run = getBaselineRunForExperiment(experimentId);
  if (run?.status !== "completed") {
    throw new Error("Diagnosis requires a completed baseline.");
  }
}

export function submitExperimentDiagnosis(
  experimentId: string,
  data: Omit<DiagnosisRecord, "id" | "status">,
): DiagnosisRecord {
  assertCompletedBaseline(experimentId);
  return recordExperimentDiagnosis(experimentId, data);
}

export function submitExperimentIntervention(
  experimentId: string,
  data: Omit<InterventionRecord, "id" | "status" | "attemptNumber">,
): InterventionRecord {
  assertCompletedBaseline(experimentId);
  return recordExperimentIntervention(experimentId, data);
}

export function submitExperimentCandidateConfig(
  experimentId: string,
  data: { rubricText: string; rubricVersion: string },
): EvaluatorConfig {
  assertCompletedBaseline(experimentId);
  return recordExperimentCandidateConfig(experimentId, data);
}

export function decideExperimentCandidate(
  experimentId: string,
  input: { decision: "accepted" | "rejected"; rationale: string; candidateVersion: string; baselineVersion: string },
): RevalidationDecision {
  const experiment = getStoredExperiment(experimentId);
  if (!experiment) throw new Error(`Unknown experiment: ${experimentId}`);
  const runId = experiment.workflow.currentCandidateRunId;
  const run = runId ? getExperimentRun(runId) : undefined;
  if (!run || run.status !== "completed") {
    throw new Error("Only a completed candidate evaluation can be accepted or rejected.");
  }
  const completed = run.caseIds.every((id) => run.cases.some((item) => item.caseId === id && item.status === "completed"));
  if (!completed) {
    throw new Error("Only a completed candidate evaluation can be accepted or rejected.");
  }
  return applyExperimentDecision(experimentId, input);
}
