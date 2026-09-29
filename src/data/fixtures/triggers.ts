// ============================================================
// Fixture: Trigger Configurations
//
// Metric triggers are configured per-deployment context.
// There are NO universal thresholds. These values are
// illustrative for the demo scenario.
// ============================================================
import type { TriggerConfig, EvaluationConfiguration } from "@/core/types";

export const triggerConfigs: TriggerConfig[] = [
  {
    id: "t-metric-fail-recall",
    type: "metric",
    metric: "fail_recall",
    operator: "<",
    threshold: 0.70,
    rationale:
      "Illustrative validation criterion: FAIL-class recall below 70% triggers review. " +
      "Context: high-stakes evaluation where missed failures have asymmetric cost. " +
      "Threshold is deployment-specific — not a universal standard.",
  },
  {
    id: "t-metric-overall",
    type: "metric",
    metric: "overall_agreement",
    operator: "<",
    threshold: 0.80,
    rationale:
      "Secondary guard: overall agreement below 80% triggers review regardless of class breakdown.",
  },
  {
    id: "t-change-evaluator",
    type: "change",
    event: "evaluator_version_changed",
    rationale:
      "Any evaluator version change requires revalidation before inheriting the prior reliability profile.",
  },
  {
    id: "t-change-rubric",
    type: "change",
    event: "rubric_version_changed",
    rationale:
      "Rubric changes can shift classification boundaries. Revalidation required.",
  },
  {
    id: "t-change-taxonomy",
    type: "change",
    event: "taxonomy_version_changed",
    rationale:
      "Taxonomy changes affect which cases are in scope. Revalidation required.",
  },
];

/**
 * The configuration that was active when the current reliability profile
 * was established (used as baseline for change triggers).
 */
export const baselineConfiguration: EvaluationConfiguration = {
  evaluatorVersion: "v0.2.0",
  rubricVersion: "rubric-v0.2",
  taxonomyVersion: "taxonomy-v0.1",
  systemVersion: "system-v1.0",
};

/**
 * The current active configuration.
 * Same as baseline → change triggers will not fire for the active evaluator.
 */
export const currentConfiguration: EvaluationConfiguration = {
  evaluatorVersion: "v0.2.0",
  rubricVersion: "rubric-v0.2",
  taxonomyVersion: "taxonomy-v0.1",
  systemVersion: "system-v1.0",
};

/**
 * Candidate configuration (would fire change triggers).
 */
export const candidateConfiguration: EvaluationConfiguration = {
  evaluatorVersion: "v0.3.0-candidate",
  rubricVersion: "rubric-v0.2",
  taxonomyVersion: "taxonomy-v0.2",
  systemVersion: "system-v1.0",
};
