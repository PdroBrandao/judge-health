import type { EvaluatorInput } from "@/core/evaluator/evaluator-adapter";
import { buildConfusionMatrix, computeReliabilityProfile } from "@/core/metrics";
import type { DatasetCase, EvaluationDataset } from "@/data/datasets";
import type {
  EvaluatorConfig,
  ExperimentBaselineRun,
  ExperimentCaseExecution,
  Judgment,
  Label,
} from "@/core/types";

export function toEvaluatorInput(
  item: Pick<DatasetCase, "id" | "input" | "systemOutput">,
  config: Pick<EvaluatorConfig, "version" | "rubricVersion" | "rubricText">,
): EvaluatorInput {
  return {
    caseId: item.id,
    input: item.input,
    systemOutput: item.systemOutput,
    rubricText: config.rubricText,
    evaluatorVersion: config.version,
    rubricVersion: config.rubricVersion,
  };
}

export function completedCount(run: ExperimentBaselineRun): number {
  return run.cases.filter((item) => item.status === "completed").length;
}

export function pendingCaseIds(run: ExperimentBaselineRun): string[] {
  const done = new Set(
    run.cases.filter((item) => item.status === "completed").map((item) => item.caseId),
  );
  return run.caseIds.filter((id) => !done.has(id));
}

export interface BaselineCaseRow {
  id: string;
  sampleType: DatasetCase["sampleType"];
  groundTruth: Label;
  input: string;
  systemOutput: string;
  judgment?: ExperimentCaseExecution;
  result?: "TP" | "FP" | "TN" | "FN";
}

export function summarizeBaseline(run: ExperimentBaselineRun, dataset: EvaluationDataset) {
  const byId = new Map(dataset.cases.map((item) => [item.id, item]));
  const scoped = run.caseIds
    .map((id) => byId.get(id))
    .filter((item): item is DatasetCase => Boolean(item));
  const judgmentById = new Map(run.cases.map((item) => [item.caseId, item]));
  const judgments: Judgment[] = run.cases
    .filter((item) => item.status === "completed" && item.label && run.caseIds.includes(item.caseId))
    .map((item) => ({
      caseId: item.caseId,
      evaluatorVersion: run.configVersion,
      predictedLabel: item.label as Label,
    }));

  const representative = scoped.filter((item) => item.sampleType === "representative");
  const targeted = scoped.filter((item) => item.sampleType === "targeted_risk");
  const profile = computeReliabilityProfile(scoped, judgments, run.configVersion);
  const targetedMatrix = buildConfusionMatrix(targeted, judgments);

  const rows: BaselineCaseRow[] = scoped.map((item) => {
    const judgment = judgmentById.get(item.id);
    const predicted = judgment?.status === "completed" ? judgment.label : undefined;
    let result: BaselineCaseRow["result"];
    if (predicted && item.groundTruth === "FAIL" && predicted === "FAIL") result = "TP";
    else if (predicted && item.groundTruth === "PASS" && predicted === "FAIL") result = "FP";
    else if (predicted && item.groundTruth === "PASS" && predicted === "PASS") result = "TN";
    else if (predicted && item.groundTruth === "FAIL" && predicted === "PASS") result = "FN";
    return {
      id: item.id,
      sampleType: item.sampleType,
      groundTruth: item.groundTruth,
      input: item.input,
      systemOutput: item.systemOutput,
      judgment,
      result,
    };
  });

  const durationMs = run.completedAt
    ? Math.max(0, new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime())
    : null;

  return {
    representativeCount: representative.length,
    targetedCount: targeted.length,
    profile,
    targetedMatrix,
    rows,
    durationMs,
    completed: completedCount(run),
  };
}
