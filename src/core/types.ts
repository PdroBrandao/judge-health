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
  | "superseded"
  | "rejected";

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

// ── Case content (UI layer — evidence screens) ────────────────
// Stored separately so core metrics are unaffected.
export interface CaseContent {
  caseId: string;
  /** Customer or user input / conversation context */
  input: string;
  /** AI system output being evaluated */
  systemOutput: string;
  /** Evaluator rationale for its judgment */
  evaluatorRationale?: string;
  /** Why this case was selected for targeted/risk review */
  riskNote?: string;
}

// ── Human reference record ─────────────────────────────────────
// "Human reference" — never "ground truth" in the UI.
export interface HumanReferenceRecord {
  caseId: string;
  reviewerAlias: string;
  label: Label;
  rationale: string;
  reviewedAt: string;
}

// ── Result quad for a single judged case ──────────────────────
export type CaseResult = "TP" | "FP" | "TN" | "FN";

export function computeResult(truth: Label, predicted: Label): CaseResult {
  if (truth === "FAIL" && predicted === "FAIL") return "TP";
  if (truth === "PASS" && predicted === "FAIL") return "FP";
  if (truth === "PASS" && predicted === "PASS") return "TN";
  return "FN"; // truth=FAIL, predicted=PASS — missed FAIL
}

// ── Evidence summary row (for list view) ─────────────────────
export interface EvidenceSummary {
  caseId: string;
  sampleType: SampleType;
  groundTruth: Label;
  evaluatorLabel: Label;
  result: CaseResult;
  hasContent: boolean;
  inputPreview?: string; // first ~90 chars of input
  riskNote?: string;
}

// ── Full case detail (for detail view) ───────────────────────
export interface CaseDetailData {
  caseId: string;
  sampleType: SampleType;
  groundTruth: Label;
  evaluatorLabel: Label;
  evaluatorVersion: string;
  result: CaseResult;
  content: CaseContent;
  humanReference?: HumanReferenceRecord;
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

// ── Workflow: Blind Human Review ──────────────────────────────
// Separate from HumanReferenceRecord (fixture). Never overwrites
// fixture reference. All three are displayed side by side.
export interface BlindHumanReview {
  id: string;
  caseId: string;
  reviewerAlias: string;
  label: Label;
  rationale: string;
  submittedAt: string;
}

// ── Workflow: Diagnosis Record ────────────────────────────────
export interface DiagnosisRecord {
  id: string;
  triggerId: string;
  evaluatorVersion: string;
  category: DiagnosisCategory;
  observationNote: string;
  revalidationRequested: boolean;
  status: "open" | "intervention_created" | "resolved";
  createdAt: string;
}

// ── Workflow: Intervention Record ─────────────────────────────
// Created from a diagnosis. Never mutates the active evaluator.
// Creates a new candidate when submitted.
export interface InterventionRecord {
  id: string;
  diagnosisId: string;
  baselineEvaluatorVersion: string;
  baselineRubricVersion: string;
  proposedRubricText: string;
  rationale: string;
  status: "draft" | "candidate_created";
  createdAt: string;
}

// ── Workflow: Revalidation Decision ──────────────────────────
export interface RevalidationDecision {
  id: string;
  candidateVersion: string;
  baselineVersion: string;
  decision: "accepted" | "rejected";
  rationale: string;
  decidedAt: string;
}
