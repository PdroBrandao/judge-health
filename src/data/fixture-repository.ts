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
  candidateEvaluatorVersion,
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
} from "@/data/fixtures";

import type {
  EvaluationCase,
  Judgment,
  EvaluatorVersion,
  TriggerConfig,
  EvaluationConfiguration,
} from "@/core/types";

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

  getCandidateEvaluatorVersion() {
    return candidateEvaluatorVersion;
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
};
