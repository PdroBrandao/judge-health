// ============================================================
// Judge Health – Core Type Definitions
// v0.1 – aligned with Judge_Health_Repo_Initialization_Brief_v0.1
// ============================================================

// ── Label taxonomy ───────────────────────────────────────────
export type Label = "PASS" | "FAIL";

// ── Sample provenance ─────────────────────────────────────────
export type SampleType = "representative" | "targeted_risk";

// ── Evaluator lifecycle ───────────────────────────────────────
export type EvaluatorStatus =
  | "draft"
  | "candidate"
  | "validated"
  | "active"
  | "superseded";

// ── Trigger types ─────────────────────────────────────────────
export type TriggerType = "metric" | "change";
export type TriggerOperator = "<" | ">" | "<=" | ">=" | "==" | "!=";
export type TriggerStatus = "open" | "closed" | "investigating";

// ── Diagnosis ─────────────────────────────────────────────────
export type DiagnosisCategory =
  | "evaluator_rubric"
  | "reference_process"
  | "context_taxonomy"
  | "other"
  | "unresolved";

// ── Version snapshot ──────────────────────────────────────────
export interface EvaluationConfiguration {
  evaluatorVersion: string;
  rubricVersion: string;
  taxonomyVersion: string;
  systemVersion: string;
}

// ── Individual case ───────────────────────────────────────────
export interface EvaluationCase {
  id: string;
  groundTruth: Label;
  sampleType: SampleType;
  /** Optional meta – not used in metrics, only for traceability */
  description?: string;
}

// ── Individual judgment ───────────────────────────────────────
export interface Judgment {
  caseId: string;
  evaluatorVersion: string;
  predictedLabel: Label;
  confidence?: number; // [0, 1] if available
}

// ── Confusion matrix (binary) ─────────────────────────────────
export interface BinaryConfusionMatrix {
  /** Positive class is FAIL (the minority / high-stakes class) */
  TP: number; // evaluator=FAIL  & truth=FAIL
  FP: number; // evaluator=FAIL  & truth=PASS
  TN: number; // evaluator=PASS  & truth=PASS
  FN: number; // evaluator=PASS  & truth=FAIL
}

// ── Wilson confidence interval ────────────────────────────────
export interface WilsonInterval {
  lower: number;
  upper: number;
  center: number;
  n: number;
}

// ── Per-class metrics ─────────────────────────────────────────
export interface PerClassMetrics {
  precision: number;
  recall: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  support: number;
  recallCI: WilsonInterval;
  precisionCI: WilsonInterval;
}

// ── Reliability profile (core output) ────────────────────────
export interface ReliabilityProfile {
  evaluatorVersion: string;
  sampleN: number;
  classCounts: Record<Label, number>;
  overallAgreement: number;
  overallAgreementCI: WilsonInterval;
  confusionMatrix: BinaryConfusionMatrix;
  perClass: Record<Label, PerClassMetrics>;
  uncertainty: {
    note: string;
    widestRecallCI: WilsonInterval;
    widestRecallClass: Label;
  };
}

// ── Metric trigger config ─────────────────────────────────────
export interface MetricTriggerConfig {
  id: string;
  type: "metric";
  metric: string; // e.g. "fail_recall"
  operator: TriggerOperator;
  threshold: number;
  rationale: string;
}

// ── Change trigger config ─────────────────────────────────────
export interface ChangeTriggerConfig {
  id: string;
  type: "change";
  event: string; // e.g. "evaluator_version_changed"
  rationale: string;
}

export type TriggerConfig = MetricTriggerConfig | ChangeTriggerConfig;

// ── Trigger evaluation result ─────────────────────────────────
export interface TriggerResult {
  config: TriggerConfig;
  fired: boolean;
  observedValue?: number;
  status: TriggerStatus;
  note?: string;
}

// ── Sampling plan ─────────────────────────────────────────────
export interface SamplingPlan {
  totalCases: number;
  representativeN: number;
  targetedRiskN: number;
  stratificationNote: string;
}

// ── Evaluator version record ──────────────────────────────────
export interface EvaluatorVersion {
  version: string;
  status: EvaluatorStatus;
  createdAt: string;
  rubricVersion: string;
  taxonomyVersion: string;
  changeDescription?: string;
}
