// ============================================================
// Judge Health – Trigger Evaluation Engine
//
// PRINCIPLE: A trigger is evidence to investigate,
// NOT evidence that the evaluator is wrong.
// ============================================================

import type {
  TriggerConfig,
  MetricTriggerConfig,
  TriggerResult,
  ReliabilityProfile,
  EvaluationConfiguration,
} from "@/core/types";

// Map metric key → value from a ReliabilityProfile
function extractMetricValue(
  metric: string,
  profile: ReliabilityProfile
): number | undefined {
  switch (metric) {
    case "overall_agreement":
      return profile.overallAgreement;
    case "fail_recall":
      return profile.perClass.FAIL.recall;
    case "pass_recall":
      return profile.perClass.PASS.recall;
    case "fail_precision":
      return profile.perClass.FAIL.precision;
    case "pass_precision":
      return profile.perClass.PASS.precision;
    case "fail_fpr":
      return profile.perClass.FAIL.falsePositiveRate;
    case "fail_fnr":
      return profile.perClass.FAIL.falseNegativeRate;
    default:
      return undefined;
  }
}

function evaluateOperator(
  observed: number,
  operator: MetricTriggerConfig["operator"],
  threshold: number
): boolean {
  switch (operator) {
    case "<":  return observed < threshold;
    case ">":  return observed > threshold;
    case "<=": return observed <= threshold;
    case ">=": return observed >= threshold;
    case "==": return observed === threshold;
    case "!=": return observed !== threshold;
  }
}

/**
 * Evaluate a single metric trigger against a reliability profile.
 */
export function evaluateMetricTrigger(
  config: MetricTriggerConfig,
  profile: ReliabilityProfile
): TriggerResult {
  const observed = extractMetricValue(config.metric, profile);
  if (observed === undefined) {
    return {
      config,
      fired: false,
      status: "closed",
      note: `Unknown metric key: "${config.metric}"`,
    };
  }

  const fired = evaluateOperator(observed, config.operator, config.threshold);
  return {
    config,
    fired,
    observedValue: observed,
    status: fired ? "open" : "closed",
    note: fired
      ? `Trigger fired: ${config.metric} = ${(observed * 100).toFixed(1)}% ${config.operator} ${(config.threshold * 100).toFixed(1)}% (threshold). This is a signal to investigate — not a verdict on the evaluator.`
      : `No trigger: ${config.metric} = ${(observed * 100).toFixed(1)}% is within configured bounds.`,
  };
}

/**
 * Evaluate a change trigger: fired when a relevant version has changed
 * from the baseline configuration.
 */
export function evaluateChangeTrigger(
  config: Extract<TriggerConfig, { type: "change" }>,
  current: EvaluationConfiguration,
  baseline: EvaluationConfiguration
): TriggerResult {
  const eventMap: Record<string, boolean> = {
    evaluator_version_changed:
      current.evaluatorVersion !== baseline.evaluatorVersion,
    rubric_version_changed:
      current.rubricVersion !== baseline.rubricVersion,
    taxonomy_version_changed:
      current.taxonomyVersion !== baseline.taxonomyVersion,
    system_version_changed:
      current.systemVersion !== baseline.systemVersion,
    external_distribution_shift_event: false, // manually raised
  };

  const fired = eventMap[config.event] ?? false;

  return {
    config,
    fired,
    status: fired ? "open" : "closed",
    note: fired
      ? `Change detected: "${config.event}". Revalidation required before inheriting reliability profile.`
      : `No change detected for "${config.event}".`,
  };
}

/**
 * Evaluate all configured triggers.
 */
export function evaluateAllTriggers(
  triggers: TriggerConfig[],
  profile: ReliabilityProfile,
  current: EvaluationConfiguration,
  baseline: EvaluationConfiguration
): TriggerResult[] {
  return triggers.map((t) => {
    if (t.type === "metric") {
      return evaluateMetricTrigger(t, profile);
    } else {
      return evaluateChangeTrigger(t, current, baseline);
    }
  });
}
