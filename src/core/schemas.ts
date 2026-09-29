// ============================================================
// Judge Health – Zod Runtime Schemas
// Validates fixture JSON before entering core logic
// ============================================================
import { z } from "zod";

export const LabelSchema = z.enum(["PASS", "FAIL"]);

export const SampleTypeSchema = z.enum(["representative", "targeted_risk"]);

export const EvaluatorStatusSchema = z.enum([
  "draft",
  "candidate",
  "validated",
  "active",
  "superseded",
]);

export const EvaluationCaseSchema = z.object({
  id: z.string(),
  groundTruth: LabelSchema,
  sampleType: SampleTypeSchema,
  description: z.string().optional(),
});

export const JudgmentSchema = z.object({
  caseId: z.string(),
  evaluatorVersion: z.string(),
  predictedLabel: LabelSchema,
  confidence: z.number().min(0).max(1).optional(),
});

export const EvaluatorVersionSchema = z.object({
  version: z.string(),
  status: EvaluatorStatusSchema,
  createdAt: z.string(),
  rubricVersion: z.string(),
  taxonomyVersion: z.string(),
  changeDescription: z.string().optional(),
});

export const MetricTriggerConfigSchema = z.object({
  id: z.string(),
  type: z.literal("metric"),
  metric: z.string(),
  operator: z.enum(["<", ">", "<=", ">=", "==", "!="]),
  threshold: z.number(),
  rationale: z.string(),
});

export const ChangeTriggerConfigSchema = z.object({
  id: z.string(),
  type: z.literal("change"),
  event: z.string(),
  rationale: z.string(),
});

export const TriggerConfigSchema = z.discriminatedUnion("type", [
  MetricTriggerConfigSchema,
  ChangeTriggerConfigSchema,
]);

// Array validators
export const CasesArraySchema = z.array(EvaluationCaseSchema);
export const JudgmentsArraySchema = z.array(JudgmentSchema);
export const EvaluatorVersionsArraySchema = z.array(EvaluatorVersionSchema);
export const TriggerConfigsArraySchema = z.array(TriggerConfigSchema);
