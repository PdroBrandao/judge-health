// ============================================================
// Fixture Repository
//
// Centralised access point for all fixture data, with
// Zod validation at the boundary. All callers receive
// typed, validated objects — no raw JSON leaks into core.
// ============================================================
import {
  CasesArraySchema,
  JudgmentsArraySchema,
  EvaluatorVersionsArraySchema,
  TriggerConfigsArraySchema,
} from "@/core/schemas";

import {
  allCases,
  evaluatorVersions,
  activeEvaluatorVersion,
  activeRubricVersion,
  activeTaxonomyVersion,
  rubricVersions,
  taxonomyVersions,
  baselineJudgments,
  candidateJudgments,
  triggerConfigs,
  baselineConfiguration,
  currentConfiguration,
  candidateConfiguration,
  getCaseContent,
  getAllCaseContent,
  caseIdsWithContent,
  getHumanReference,
} from "@/data/fixtures";

import type {
  EvaluationCase,
  Judgment,
  EvaluatorVersion,
  TriggerConfig,
  EvaluationConfiguration,
  EvidenceSummary,
  CaseDetailData,
} from "@/core/types";
import { computeResult } from "@/core/types";

function validated<T>(schema: { parse: (v: unknown) => T }, data: unknown): T {
  return schema.parse(data);
}

export const FixtureRepository = {
  getCases(): EvaluationCase[] {
    return validated(CasesArraySchema, allCases) as EvaluationCase[];
  },

  getBaselineJudgments(): Judgment[] {
    return validated(JudgmentsArraySchema, baselineJudgments) as Judgment[];
  },

  getCandidateJudgments(): Judgment[] {
    return validated(JudgmentsArraySchema, candidateJudgments) as Judgment[];
  },

  getEvaluatorVersions(): EvaluatorVersion[] {
    return validated(
      EvaluatorVersionsArraySchema,
      evaluatorVersions
    ) as EvaluatorVersion[];
  },

  getActiveEvaluatorVersion() {
    return activeEvaluatorVersion;
  },

  getActiveRubricVersion() {
    return activeRubricVersion;
  },

  getActiveTaxonomyVersion() {
    return activeTaxonomyVersion;
  },

  getRubricVersions() {
    return rubricVersions;
  },

  getTaxonomyVersions() {
    return taxonomyVersions;
  },

  getTriggerConfigs(): TriggerConfig[] {
    return validated(TriggerConfigsArraySchema, triggerConfigs) as TriggerConfig[];
  },

  getBaselineConfiguration(): EvaluationConfiguration {
    return baselineConfiguration;
  },

  getCurrentConfiguration(): EvaluationConfiguration {
    return currentConfiguration;
  },

  getCandidateConfiguration(): EvaluationConfiguration {
    return candidateConfiguration;
  },

  // ── Evidence methods (Milestone 2) ────────────────────────

  /** All evidence summaries, optionally filtered by sampleType */
  getEvidenceSummaries(
    sampleType?: "representative" | "targeted_risk"
  ): EvidenceSummary[] {
    const cases = validated(CasesArraySchema, allCases) as EvaluationCase[];
    const judgments = validated(JudgmentsArraySchema, baselineJudgments) as Judgment[];

    // Build judgment lookup (baseline evaluator)
    const judgeMap = new Map(judgments.map((j) => [j.caseId, j]));

    const filtered = sampleType
      ? cases.filter((c) => c.sampleType === sampleType)
      : cases;

    return filtered.map((c): EvidenceSummary => {
      const judgment = judgeMap.get(c.id);
      const evaluatorLabel = judgment?.predictedLabel ?? "PASS";
      const result = computeResult(c.groundTruth, evaluatorLabel);
      const content = getCaseContent(c.id);

      return {
        caseId: c.id,
        sampleType: c.sampleType,
        groundTruth: c.groundTruth,
        evaluatorLabel,
        result,
        hasContent: caseIdsWithContent.has(c.id),
        inputPreview: content
          ? content.input.slice(0, 90) + (content.input.length > 90 ? "…" : "")
          : undefined,
        riskNote: content?.riskNote,
      };
    });
  },

  /** Full detail data for a single case */
  getCaseDetail(caseId: string, evaluatorVersion: string): CaseDetailData | null {
    const cases = validated(CasesArraySchema, allCases) as EvaluationCase[];
    const judgments = validated(JudgmentsArraySchema, baselineJudgments) as Judgment[];

    const c = cases.find((x) => x.id === caseId);
    if (!c) return null;

    const content = getCaseContent(caseId);
    if (!content) return null; // no detail view without content

    const judgment = judgments.find(
      (j) => j.caseId === caseId && j.evaluatorVersion === evaluatorVersion
    ) ?? judgments.find((j) => j.caseId === caseId);

    const evaluatorLabel = judgment?.predictedLabel ?? "PASS";
    const result = computeResult(c.groundTruth, evaluatorLabel);
    const humanReference = getHumanReference(caseId);

    return {
      caseId,
      sampleType: c.sampleType,
      groundTruth: c.groundTruth,
      evaluatorLabel,
      evaluatorVersion: judgment?.evaluatorVersion ?? evaluatorVersion,
      result,
      content,
      humanReference,
    };
  },

  getCaseContent,
  getAllCaseContent,
  getHumanReference,
};
