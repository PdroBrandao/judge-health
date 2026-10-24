"use server";

import { revalidatePath } from "next/cache";
import { OpenAIEvaluator } from "@/core/evaluator/openai-evaluator";
import { BASELINE_TIMEOUT_MS, judgeWithRetry } from "@/core/evaluator/retry-policy";
import { pendingCaseIds, toEvaluatorInput } from "@/core/experiment-baseline";
import { getDataset } from "@/data/datasets";
import { activeWorkspace } from "@/data/experiment-store";
import { getStoredExperiment } from "@/data/experiment-store";
import {
  DuplicateBaselineError,
  finishBaseline,
  getBaselineRunForExperiment,
  getCandidateRunForExperiment,
  getExperimentRun,
  recordBaselineCase,
  startBaseline,
  startCandidateRun,
} from "@/data/experiment-run-store";
import type { EvaluatorConfig, ExperimentBaselineRun, ExperimentCaseExecution } from "@/core/types";

const inFlight = new Set<string>();

function refresh() {
  revalidatePath("/");
  revalidatePath("/evidence");
  revalidatePath("/revalidation");
  revalidatePath("/history");
  revalidatePath("/calibration-report");
}

async function judgeRunCase(
  run: ExperimentBaselineRun,
  caseId: string,
  config: EvaluatorConfig,
): Promise<ExperimentBaselineRun> {
  if (run.status === "completed") return run;
  if (!run.caseIds.includes(caseId)) throw new Error(`Case ${caseId} is outside the frozen sample.`);
  const existing = run.cases.find((item) => item.caseId === caseId && item.status === "completed");
  if (existing) return run;

  const key = `${run.runId}:${caseId}`;
  if (inFlight.has(key)) return getExperimentRun(run.runId) ?? run;
  inFlight.add(key);
  try {
    const dataset = getDataset(run.datasetId);
    const item = dataset?.cases.find((entry) => entry.id === caseId);
    if (!item?.hasContent) {
      return recordBaselineCase(run.runId, {
        caseId,
        status: "failed",
        error: `No stored input or agent output for ${caseId}.`,
        attempts: 1,
      });
    }
    const input = toEvaluatorInput(item, config);
    const evaluator = new OpenAIEvaluator();
    const judged = await judgeWithRetry({
      call: async () => {
        const result = await evaluator.judgeConfiguredCase(input, {
          modelId: run.modelId,
          maxCompletionTokens: run.inference.maxCompletionTokens,
          timeoutMs: BASELINE_TIMEOUT_MS,
          responseFormat: run.inference.responseFormat,
        });
        return {
          label: result.label,
          rationale: result.rationale,
          latencyMs: result.latencyMs,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
        };
      },
    });
    const execution: ExperimentCaseExecution = judged.ok
      ? {
          caseId,
          status: "completed",
          label: judged.result.label,
          rationale: judged.result.rationale,
          latencyMs: judged.result.latencyMs,
          promptTokens: judged.result.promptTokens,
          completionTokens: judged.result.completionTokens,
          totalTokens: judged.result.totalTokens,
          attempts: judged.attempts,
        }
      : {
          caseId,
          status: "failed",
          error: judged.error,
          attempts: judged.attempts,
        };
    return recordBaselineCase(run.runId, execution);
  } finally {
    inFlight.delete(key);
    refresh();
  }
}

export async function actionStartBaseline(): Promise<ExperimentBaselineRun> {
  const workspace = activeWorkspace();
  if (workspace.mode !== "configured") {
    throw new Error("Select a named experiment before running a baseline.");
  }
  const existing = getBaselineRunForExperiment(workspace.experiment.id);
  if (existing) return existing;
  try {
    const run = startBaseline(workspace.experiment);
    refresh();
    return run;
  } catch (err) {
    if (err instanceof DuplicateBaselineError) {
      const raced = getBaselineRunForExperiment(workspace.experiment.id);
      if (raced) return raced;
    }
    throw err;
  }
}

export async function actionJudgeBaselineCase(caseId: string): Promise<ExperimentBaselineRun> {
  const workspace = activeWorkspace();
  if (workspace.mode !== "configured") throw new Error("No active experiment.");
  const experiment = getStoredExperiment(workspace.experiment.id) ?? workspace.experiment;
  const run = experiment.baselineRunId
    ? getExperimentRun(experiment.baselineRunId)
    : getBaselineRunForExperiment(experiment.id);
  if (!run) throw new Error("Start the baseline before judging a case.");
  return judgeRunCase(run, caseId, experiment.config);
}

export async function actionStartCandidate(): Promise<ExperimentBaselineRun> {
  const workspace = activeWorkspace();
  if (workspace.mode !== "configured") throw new Error("No active experiment.");
  const experiment = getStoredExperiment(workspace.experiment.id) ?? workspace.experiment;
  const configId = experiment.workflow.currentCandidateConfigId;
  if (!configId) throw new Error("Create a candidate configuration before evaluating it.");
  const existing = getCandidateRunForExperiment(experiment.id);
  if (existing) return existing;
  const run = startCandidateRun(experiment, configId);
  refresh();
  return run;
}

export async function actionJudgeCandidateCase(caseId: string): Promise<ExperimentBaselineRun> {
  const workspace = activeWorkspace();
  if (workspace.mode !== "configured") throw new Error("No active experiment.");
  const experiment = getStoredExperiment(workspace.experiment.id) ?? workspace.experiment;
  const run = getCandidateRunForExperiment(experiment.id);
  if (!run) throw new Error("Start the candidate evaluation first.");
  const config = experiment.workflow.configs.find((item) => item.id === run.configId);
  if (!config) throw new Error("The candidate configuration is missing.");
  return judgeRunCase(run, caseId, config);
}

export async function actionFinishCandidate(): Promise<ExperimentBaselineRun> {
  const workspace = activeWorkspace();
  if (workspace.mode !== "configured") throw new Error("No active experiment.");
  const run = getCandidateRunForExperiment(workspace.experiment.id);
  if (!run) throw new Error("No candidate run to finish.");
  const finished = finishBaseline(run.runId);
  refresh();
  return finished;
}

export async function actionFinishBaseline(): Promise<ExperimentBaselineRun> {
  const workspace = activeWorkspace();
  if (workspace.mode !== "configured") throw new Error("No active experiment.");
  const run = getBaselineRunForExperiment(workspace.experiment.id);
  if (!run) throw new Error("No baseline run to finish.");
  const finished = finishBaseline(run.runId);
  refresh();
  return finished;
}

export async function actionBaselineProgress(): Promise<{
  run: ExperimentBaselineRun | null;
  pending: string[];
}> {
  const workspace = activeWorkspace();
  if (workspace.mode !== "configured") return { run: null, pending: [] };
  const run = getBaselineRunForExperiment(workspace.experiment.id) ?? null;
  return { run, pending: run ? pendingCaseIds(run) : [] };
}
