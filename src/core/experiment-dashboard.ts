import { computeReliabilityProfile } from "@/core/metrics";
import { evaluateAllTriggers } from "@/core/triggers";
import { computeResult } from "@/core/types";
import type { EvaluationDataset } from "@/data/datasets";
import type {
  CaseDetailData,
  EvaluationCase,
  EvaluationConfiguration,
  EvidenceSummary,
  ExperimentBaselineRun,
  ExperimentRecord,
  Judgment,
  MetricTriggerConfig,
  ReliabilityProfile,
  TriggerConfig,
  TriggerResult,
} from "@/core/types";

export interface TargetedGuardrail {
  total: number;
  failN: number;
  passN: number;
  caught: number;
  missed: number;
  falseAlarms: number;
  evaluated: number;
}

export interface ExperimentDashboardModel {
  measured: boolean;
  demonstration: boolean;
  experimentId: string;
  experimentName: string;
  modelId: string;
  rubricVersion: string;
  configVersion: string;
  runId: string | null;
  caseCount: number;
  representativeN: number;
  targetedN: number;
  profile: ReliabilityProfile;
  triggerResults: TriggerResult[];
  gaugeThreshold: number;
  failRecallFired: boolean;
  targeted: TargetedGuardrail;
  representativeEvidence: EvidenceSummary[];
  targetedEvidence: EvidenceSummary[];
  totalTokens: number | null;
  durationMs: number | null;
}

/** The active configuration and the baseline configuration are the same until a candidate exists. */
export function experimentConfiguration(experiment: ExperimentRecord): EvaluationConfiguration {
  return {
    evaluatorVersion: experiment.config.version,
    rubricVersion: experiment.config.rubricVersion,
    taxonomyVersion: "unscoped",
    systemVersion: "named-experiment",
  };
}

export function buildExperimentDashboard(
  experiment: ExperimentRecord,
  run: ExperimentBaselineRun | null,
  dataset: EvaluationDataset,
  triggers: TriggerConfig[],
): ExperimentDashboardModel {
  const allowed = new Set(experiment.caseIds);
  const scoped = dataset.cases.filter((item) => allowed.has(item.id));
  const cases: EvaluationCase[] = experiment.caseIds
    .map((id) => scoped.find((item) => item.id === id))
    .filter((item): item is EvaluationDataset["cases"][number] => Boolean(item))
    .map((item) => ({
      id: item.id,
      groundTruth: item.groundTruth,
      sampleType: item.sampleType,
    }));

  const judged = (run?.cases ?? []).filter((item) => (
    item.status === "completed"
    && item.label
    && allowed.has(item.caseId)
  ));
  const judgments: Judgment[] = judged.map((item) => ({
    caseId: item.caseId,
    evaluatorVersion: experiment.config.version,
    predictedLabel: item.label!,
  }));
  const profile = computeReliabilityProfile(cases, judgments, experiment.config.version);
  const configuration = experimentConfiguration(experiment);
  const triggerResults = evaluateAllTriggers(triggers, profile, configuration, configuration);
  const failRecall = triggers.find((item): item is MetricTriggerConfig => (
    item.type === "metric" && item.metric === "fail_recall"
  ));
  const measured = run?.status === "completed";

  const byCase = new Map(scoped.map((item) => [item.id, item]));
  const byJudgment = new Map(judged.map((item) => [item.caseId, item]));
  const evidence = cases.flatMap((item) => {
    const source = byCase.get(item.id);
    const judgment = byJudgment.get(item.id);
    if (!source || !judgment?.label) return [];
    const row: EvidenceSummary = {
      caseId: item.id,
      sampleType: item.sampleType,
      groundTruth: item.groundTruth,
      evaluatorLabel: judgment.label,
      result: computeResult(item.groundTruth, judgment.label),
      hasContent: source.hasContent,
      inputPreview: source.input.slice(0, 90),
    };
    return [row];
  });

  const targetedCases = cases.filter((item) => item.sampleType === "targeted_risk");
  const targetedFail = targetedCases.filter((item) => item.groundTruth === "FAIL");
  const targetedPass = targetedCases.filter((item) => item.groundTruth === "PASS");
  const caught = targetedFail.filter((item) => byJudgment.get(item.id)?.label === "FAIL").length;
  const falseAlarms = targetedPass.filter((item) => byJudgment.get(item.id)?.label === "FAIL").length;

  return {
    measured,
    demonstration: dataset.demonstration,
    experimentId: experiment.id,
    experimentName: experiment.name,
    modelId: run?.modelId ?? experiment.config.modelId,
    rubricVersion: experiment.config.rubricVersion,
    configVersion: experiment.config.version,
    runId: run?.runId ?? null,
    caseCount: cases.length,
    representativeN: cases.filter((item) => item.sampleType === "representative").length,
    targetedN: targetedCases.length,
    profile,
    triggerResults,
    gaugeThreshold: failRecall?.threshold ?? 0.7,
    failRecallFired: measured && triggerResults.some((item) => (
      item.fired && item.config.type === "metric" && item.config.metric === "fail_recall"
    )),
    targeted: {
      total: targetedCases.length,
      failN: targetedFail.length,
      passN: targetedPass.length,
      caught,
      missed: targetedFail.length - caught,
      falseAlarms,
      evaluated: targetedCases.filter((item) => byJudgment.has(item.id)).length,
    },
    representativeEvidence: evidence.filter((item) => item.sampleType === "representative"),
    targetedEvidence: evidence.filter((item) => item.sampleType === "targeted_risk"),
    totalTokens: run?.usage.totalTokens ?? null,
    durationMs: run?.completedAt
      ? Math.max(0, new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime())
      : null,
  };
}

export function experimentCaseDetail(
  experiment: ExperimentRecord,
  run: ExperimentBaselineRun | null,
  dataset: EvaluationDataset,
  caseId: string,
): CaseDetailData | null {
  if (!experiment.caseIds.includes(caseId)) return null;
  const source = dataset.cases.find((item) => item.id === caseId);
  const judgment = run?.cases.find((item) => item.caseId === caseId && item.status === "completed" && item.label);
  if (!source || !judgment?.label) return null;
  return {
    caseId,
    sampleType: source.sampleType,
    groundTruth: source.groundTruth,
    evaluatorLabel: judgment.label,
    evaluatorVersion: experiment.config.version,
    result: computeResult(source.groundTruth, judgment.label),
    content: {
      caseId,
      input: source.input,
      systemOutput: source.systemOutput,
      evaluatorRationale: judgment.rationale,
    },
  };
}

export function experimentJudgments(
  experiment: ExperimentRecord,
  run: ExperimentBaselineRun | null,
): Judgment[] {
  return (run?.cases ?? [])
    .filter((item) => item.status === "completed" && item.label && experiment.caseIds.includes(item.caseId))
    .map((item) => ({
      caseId: item.caseId,
      evaluatorVersion: experiment.config.version,
      predictedLabel: item.label!,
    }));
}
